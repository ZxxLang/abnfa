# Developing within ABNFA

这里描述 ABNFA 的技术要点, 对书写文法文件或深度开发都有帮助.
方便起见, 下文用子元素表示子节点,子成员或子元素, 而子层不一定是子元素,
因为字段前缀 `/`,`?` 向上追溯父节点.

## patternize

patternize 转换 meta 中所有的 `to--action`, `refer--action` 为 index 结构.

对于 ABNFA 文法的 source, 我们的目标是通过 lang-coder 生成代码, 供 builder 调用.
patternize 生成的 index 结构使得 lang-coder 生成的函数只需要有一个 builder 参数.

    index.refer 或 index.action 为 0 时表示无引用规则或无动作, 不允许同时为 0.
    因为第二条规则对应的 refer 编号为 0, 所以不允许第二条规则被引用
    如果需要引用第二条, 可以增加一条规则如: result = original-second-rule-name

## lang-coder

lang-coder 负责编译 patternize 后的 meta 到具体语言的代码(coder).

本包实现了编译到 JavaScript 的 js-coder.

编译结果 coder.formulas 是调用 builder 的 JavaScript 函数数组.

builder.parse 从 coder.formulas[0] 开始调用.

因为语言差异, 不同语言需要实现自己的 builder 和对应的 lang-coder.
而且实现差异会很大不同. 比如:

因为 JavaScript 是弱类型语言, 生成的 coder 不需要引入(解耦) builder.js.
如果实现 go-coder 的话, 生成的 coder 中 import "builder" 会更方便,
这样不需要在 go-coder 中分析参数类型合法性, 用 go 编译 coder 就可以发现问题.

## Builder

builder 模块实现了三种模式的构建器, 实例可供外部使用的方法和属性包括:

1. parse(source)  从 coder.formulas[0] 开始解析, 返回是否全完全成功.
1. isPartial()    返回是否为部分解析, 即 source 没有被消耗完
1. isNothing()    返回动作记录是否为空, 即没有生成动作
1. build()        构建并返回结果, 需要在执行该方法前先执行解析
1. record         属性, (解析)动作和(构建)数据记录数组
1. length         属性, record 的有效长度

倒序动作记录索引的原因参见下文的后序遍历树部分.

builder 的多数方法被 js-coder 生成的 coder.formulas 调用, 包括:

1. Any,More,Once,Option,Repeat 实现了 repeat
1. EatXxx 实现了直接数据匹配
1. direct_xx 实现了直接执行的 `to--action`
1. refer_xxx 实现了 `refer--action`, 通过 Pin 调用
1. to_xxx 函数实现了其它 `to--action`, 通过 Pin 调用
1. Pin 保存动作序号到动作记录, 匹配全部成功后再执行

动作序号是动作函数在 coder.formulas 中的索引号.

## Decoder

内建的 [decoder](lib/decoder.js) 提供了一些特别格式数据的处理,
builder 的第二个参数是可选的扩展 decoder, builder 把它们复合成一个.

decoder 的结构与 action 的通用类型名和 `decode` 名称对应.

一个 `decode` 函数只需要一个数据参数, 为了区分两种类型 `string`, `bytes` 约定:

    第一参数为 builder 实例, 以便 decode 获取更多信息
    第二参数为数据, 类型为字符串或 byte 数组
    第三参数可选, 仅表示第二参数类型为 byte 数组

当只有两个参数且数据源为 `bytes` 类型时 builder 负责转换 byte 数组到字符串.

在 bits 模式下, 有可能出现偏移量非 8bit 对齐的数据, 被整理为右对齐的 bytes.

比如:

    xxxxyyyy yyyyyyyy yyyyyxxx
    xxxyyyyy yyyyyyyy yyyyxxxx
    xxyyyyyy yyyyyyyy yyyxxxxx

其中 y 表示匹配位, 而 x 表示之前的或向后的遗留位, 传递的数据都是:

    0000000y yyyyyyyy yyyyyyyy

即右对齐并用 0 补全高位, 并把补全的位数传递给第二参数, 本例的伪代码是:

```
decode([0b0000000y,0byyyyyyyy,0byyyyyyyy], 7)
```

同理, 如果只有一个 bit 位被匹配, 无论是哪一位, 伪代码都是:

```
decode([0b00000001], 7)
```

显然 decode 函数:

1. `string mode` 只支持一个参数且为字符串类型
1. `byte mode`   还支持 bytes 类型的第一参数且第二参数固定为 0
1. `bits mode`   还支持 bytes 类型的第一参数且第二参数值范围为 [0..7]

## Bootstrap

第一个 meta 是手工写的 [grammar](lib/grammar.js), 并实现自举:

```text
coder0 = js-coder( patternize( grammar ) )
coder1 = js-coder( patternize( builder(coder0).parse(abnfa.abnf) ) )
coder  = js-coder( patternize( builder(coder1).parse(abnfa.abnf) ) )
assert(coder === coder1)
```

## result

最终结果可能是 AST 或 Non-AST 的, 参见 [json.abnf][] 和 [json-parser.abnf][].

在 [ABNFA Definition of ABNFA][] 中支持三种类型描述:

1. 结构体      圆括号内包含字段描述, 仅用于描述节点
1. 缺省值      支持字符串, 正整数, 布尔真和假. 可用于描述字段
1. 风格和注解  形式为 `kind<Annotation...>`. 可用于描述节点和字段

风格和注解是在 `类型注解` 前增加可选的 kind:

1. ARRAY     数组
1. UNIQUE    元素不重复的数组
1. OBJECT    Key-Value 对象, Key 为字符串类型
1. interface 接口
1. mixins    混入字段, 仅为复用描述字段提供的便捷语法糖

大写的 kind 名称被动作类型使用, 其它则不被使用.
Annotation 描述元素或成员的类型, 通用或自定义的. 被动作类型使用.

例: 接口类型

```text
root ARRAY<Node>

Node interface<root, STRING>

rule  = refer--ARRAY ; Note here that ARRAY is a generic type name
node  = something--root / other--STRING
```

例: 枚举类型为多个可选类型提供的便捷语法糖

```text
root ARRAY<enum> ; equal ARRAY<root, STRING>

enum <root, STRING>

rule  = refer--ARRAY ; Note here that ARRAY is a generic type name
refer = something--root / other--STRING
```

如果要在结果中显示 `interface`, 可以设想下面的结构麻烦且很难面面俱到.

```json
[
  {
    "type": "Node",
    "instance": {
      "type": "root"
      // 后续字段该怎么设计....还有数组, 指针等等嵌套起来更恐怖
    }
  },
  "string...."
]
```

所以本实现决定下列情况的类型名称不被动作使用, 且不出现在结果中

1. 混入字段 因为只是便捷语法糖
1. 枚举类型 因为只是便捷语法糖
1. 接口类型 因为结构实现太复杂, 采取的处理算法和类型枚举一样

简便起见 js-coder 把它们全部展开(不支持循环嵌套), 交给 builder 处理.

这使得文法中生成的类型只能为下列之一:

1. ARRAY
1. UNIQUE
1. OBJECT
1. 通用类型名称 叶子节点

父节点的 annotation 属性描述对子元素的 kind 约束, 空或通用和结构体类型名列表.

## pointer

本实现不支持指针类型, 原因:

1. 作者没有发现真实的使用场景
1. JavaScript 不能直接支持指针, 需要使用额外的丑陋的结构实现

注意, AST 中的指针只是结构体的一个字段标记, 生成代码时生成相应指针操作代码.

## Algorithm

主要的算法集中在 js-coder 和 builder 中.

减少函数调用次数由 js-coder 负责, 有很大优化空间, 很难在这里讨论.

如:

```abnf
infinite = *loop
loop     = *other
```

明显的死循环, 这有待发现和报错.

减少动作记录回退由 builder 负责, 主要是通过扁平后序遍历树实现.

    动作记录是一个扁平化的后序遍历树

动作记录是二维数组, 在 `refer--action` 中的 `refer` 成功后依据 `action` 生成,
每条记录中包括:

    开始和结束的偏移量
    开始和结束所在行号或者 bits 模式下遗留高位 bit 位数(0 .. 7)
    动作编号 也就是 action 在 coder.formulas 中的索引号

这些元素都是整型.

全部匹配成功后执行动作编号对应的动作函数, 会生成字段记录, 包括:

    类型名称 非空
    字段名称 即保存到父节点的位置, 空字符串用于根节点或者数组元素
    终结值   叶子节点会拥有该值

本实现把字段记录直接附加在动作记录之后, 它们是一一对应的(有些被置空).
细节参见 builder 源码中的 `points`, `save`, `decode`, `meta` 等方法.

匹配是从内向外的, `refer` 成功才记录 `action`, 因此效率很高.

同时也使得该记录的顺序是从内向外, 从下向上的 `扁平后序遍历树`

假设生成目标的树形结构:

```text
parent
  children1
    subchild1
  children2
    subchild2
  children3
```

对应的动作记录: [动作序号, 匹配前的动作记录长度, 开始偏移量, 结束偏移量]

```text
[
  [subchild1-action, 0, subchild1-begin, subchild1-end],
  [children1-action, 0, children1-begin, children1-end],

  [subchild2-action, 2, subchild2-begin, subchild2-end],
  [children2-action, 2, children2-begin, children2-end],

  [children3-action, 4, children3-begin, children3-end],

  [parent-action,    0, parent-begin,    parent-end]
]
```

可以看出, 根据 `匹配前的动作记录长度` 可以计算出节点的层级关系.

    最后一条记录对应第一个节点, 其中 匹配前的动作记录长度 一定为 0

构建以深度优先遍历这个 `扁平后序遍历树`, 重放动作生成子层数据记录并装配.

    构建保存逐层生成的节点到(父节点)栈, 以便向上追溯, 回退

数据记录特征:

1. 叶子节点的记录包含: 数据类型, 分配字段, 值
1. 其它节点的记录包含: 数据类型, 分配字段
1. 动作 `move` 和 `type` 不生成新记录, 但会改变已有记录

构建次序:

1. 最后一条动作记录一定是根节点记录, 并作为当前节点
1. 构建当前节点并入栈
1. 正序生成子层数据记录
1. 装配叶子节点到父节点, 非叶子节点递归算法第二步

装配时对类型进行检查, 这可能要向上追溯祖节点的定义.

## DIY

事实上 ABNFA 文法只是扩展了动作语法, 并未预留动作名, 甚至未限定 meta 的写法.

从另外的角度看 ABNFA 更像是:

    带类型处理的解析器组合子的 ABNF 语法描述

本实现的算法复杂度并不高, 如果要支持其它语言, 推荐直接用目标语言
手工构建一份 grammar 和 xx-coder, 从 ABNFA 自举开始实现.

所以如果用 ABNFA 文法构建一个以 AST 为数据源的分析器, 这是可能的.
而强类型语言实现可能要求提供构造方法或引入特定的包, 甚至 builder 也生成.

## License

BSD 2-Clause License

Copyright (c) 2018, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNFA Definition of ABNFA]: https://github.com/ZxxLang/abnfa/blob/master/grammar/abnfa.abnf
[json.abnf]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json.abnf
[json-parser.abnf]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json-parser.abnf