# ABNFA

ABNFA 基于 [ABNF][] 衍生定义了 Actions 语法, 为生成抽象语法树提供工具链.

ABNFA 约定规则名大小写敏感且首个规则名表示根对象, 以 "-" 分割引用规则名表示动作.

核心工具链生成下述结构元素组成的动作数组:

```yaml
start: Number
end: Number
raw: String
action:
  produce: String
  method: String
  key: String
  flag: String
```

该结构包含匹配的字符串, 位置信息以及最终的动作.

    start   是该动作匹配输入的开始偏移量.
    end     是该动作匹配输入的结束偏移量(不包含 end).
    raw     匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    action  描述如何生成每个节点, 以及节点和属性的关系.

ABNFA 定义的 action 是语义性描述, key 和 flag 在不同的 method 下会改变角色.

1. produce   自定义类型名称, 用于生成对象或拼接字符串.
2. method    动作方法名
    1. to    已有 produce 为目标, 对 target[key] 赋值.
    2. term  终结符必用, 为生成目标拼接匹配的字符串.
    3. mix   新的 produce 为目标.
    4. alter 可与 produce 组合, 以 key, flag 为参数向前改变 to 方法的参数.
    5. fetch 已有 produce 为目标, 赋值 produce[key] 到 target[flag].
3. key       动作参数, 属性名称.
4. flag      动作参数, 行为标记, 缺省为字符串拼接.
    1. back  目标回退.
    2. list  目标属性是数组, 向目标添加元素.
    3. true  设置目标属性值为 true.
    4. false 设置目标属性值为 false.
    5. PREC  用于运算符优先级, 以首个字符串表示结合性的替代语法由低到高描述.
        1. "%binary" 二元运算, 后续为运算符.
        2. "%left"   一元运算左结合, 后续为运算符.
        3. "%right"  一元运算右结合, 后续为运算符.

显然一个动作至少要包含 produce 或 method 之一.
关键在于 produce 和 method 的组合顺序, 约定动作行为优先级(算法概要):

1. 含 produce 或 method 的动作被保留或合并, 并作为查找边界 B (boundary).
2. 含 mix 的动作向后查找边界, [mix, B) 间的动作被保留.
3. 含 alter 的动作向前查找边界 B, 并做相应的替换.
4. 含 method 且不含 produce 的动作向前查找不含 method 的边界 B 进行动作合并.
5. 含 produce 且不含 method 的动作向前查找不含 produce 的边界 B 进行动作合并.
6. 匹配成功后, 调整 [mix, B) 间动作到 B 之后, mix 被替换为 to.

使用 action 进行语法定义的复杂度和语法本身的复杂度成正比.

    越复杂的语法越需要使用者细心定义才能正确工作

# Example

本节逐步展示实现支持符号位和千位分隔符的四则运算 ABNFA 语法.

支持以空格分隔的多个千位分隔符数值的 ABNFA 定义:

```abnf
Array     = 1*(thousands-Number-to--list [SP])
thousands = 1*3DIGIT--term *("," 3DIGIT--term)
DIGIT     = %x30-39
SP        = %x20
```

匹配样例 `0,234 678` 得到动作数组:

```yaml
- action:
    produce: Number
    method: to
    flag: list
  start: 0
  end: 5
  raw: '0234'
- action:
    produce: Number
    method: to
    flag: list
  start: 6
  end: 9
  raw: '678'
```

增加前置符号位支持:

```abnf
Array     = 1*(*sign--mix-sign thousands-Number-to--list [SP])
sign      = "+" / "-"
thousands = 1*3DIGIT--term *("," 3DIGIT--term)
DIGIT     = %x30-39
SP        = %x20
```

匹配样例 `--0,234 678` 得到动作数组:

```yaml
- action:
    method: mix
    key: sign
  start: 0
  end: 2
  raw: '--'
- action:
    produce: Number
    method: to
    flag: list
  start: 2
  end: 7
  raw: '0234'
- action:
    produce: Number
    method: to
    flag: list
  start: 8
  end: 11
  raw: '678'
```

支持符号位和千位分隔符的四则运算的 ABNFA 定义:

```abnf
Expr      = factor--to-left *(op--to-operator-PREC factor--to-right)
factor    = *sign--mix-sign ( thousands-Number / "(" Expr-Expr ")" )
sign      = "+" / "-"
thousands = 1*3DIGIT--term *("," 3DIGIT--term)
DIGIT     = %x30-39
op        = "+" / "-" / "*" / "/"

PRECEDENCES = "%binary" "+" "-" /
              "%binary" "*" "/"
```

匹配样例 `-1,234+5*(6-7*8)` 得到动作数组:

```abnf
- action:
    method: to
    key: left
  start: 0
  end: 6
- action:
    method: mix
    key: sign
  start: 0
  end: 1
  raw: '-'
- action:
    produce: Number
  start: 1
  end: 6
  raw: '1234'
- action:
    method: term
    key: operator
    flag: PREC
  start: 6
  end: 7
  raw: +
- action:
    produce: Number
    method: to
    key: right
  start: 7
  end: 8
  raw: '5'
- action:
    method: term
    key: operator
    flag: PREC
  start: 8
  end: 9
  raw: '*'
- action:
    produce: Expr
    method: to
    key: right
  start: 9
  end: 16
- action:
    produce: Number
    method: to
    key: left
  start: 10
  end: 11
  raw: '6'
- action:
    method: term
    key: operator
    flag: PREC
  start: 11
  end: 12
  raw: '-'
- action:
    produce: Number
    method: to
    key: right
  start: 12
  end: 13
  raw: '7'
- action:
    method: term
    key: operator
    flag: PREC
  start: 13
  end: 14
  raw: '*'
- action:
    produce: Number
    method: to
    key: right
  start: 14
  end: 15
  raw: '8'
```

# Actions

ABNFA 核心工具链从文法规则到匹配输入生成一系列对象:

    grammar ->
    core.tokenize -> array of token ->
    core.Entries  -> array of token-group-by-the-rule-based ->
    core.Rules    -> grammar-AST ->
    core.Actions(inputSource) -> array of action

工具链的行为:

    只构建生成 AST 的动作, 依据 action 提取(合并)匹配的字符串.
    没有描述 action 的匹配被丢弃.
    不直接生成节点对象 produce, 不操作树节点.
    生成的 Actions 数组用来生成 AST, 具体行为由装配器决定.

显然最终的装配器应该具有风格化并可定制.

以有两个数值字符串, 以空格分隔的千位数值字符串样本 `0,234 678` 为例.

```abnf
rules     = 1*(thousands-Number-to--list [SP])
thousands = 1*3DIGIT--term *("," 3DIGIT--term)
DIGIT     = %x30-39
SP        = %x20
```

output:

```yaml
- start: 0
  end: 5
  action:
    produce: Number
    method: push
  raw: '0234'
- null
- start: 6
  end: 9
  action:
    produce: Number
    method: push
  raw: '678'
- null
```

该数组中的 'method: "term"' 没有了, 被合并到上级 produce.

该数组的顺序就是对 AST 构建过程的描述:

0. 生成 Number 对象作为 current 对象, 并 push 到 parent
1. 弹出 current, parent 不变
2. 生成 Number 对象作为 current 对象, 并 push 到 parent
3. 弹出 current, parent 不变

通常生成一个对象显然要对它进行(属性)赋值, 因此 push 到 parent 要到 current 或 parent 发生改变(弹出)时才执行.

上例中因为需要丢弃逗号, 所以使用了 `1*3DIGIT--term`, 下例展示 produce 的作用.

示例: 四则运算, 不支持符号位, 不支持优先级

```abnf
rules  = Factor---left *(Op-String--op Factor---right)
Factor = Num-Number / "(" rules-Expr ")"
Op     = SumOp / MulOp
SumOp  = "+" / "-"
MulOp  = "*" / "/"
Num    = 1*(%x30-39)
```

输入样本: `1+2*3`

```yaml
- start: 0
  end: 1
  action:
    produce: Number
    key: left
  raw: '1'
- null
- start: 1
  end: 2
  action:
    produce: String
    method: ''
    key: op
  raw: +
- null
- start: 2
  end: 3
  action:
    produce: Number
    key: right
  raw: '2'
- null
- start: 3
  end: 4
  action:
    produce: String
    method: ''
    key: op
  raw: '*'
- null
- start: 4
  end: 5
  action:
    produce: Number
    key: right
  raw: '3'
- null
```

不能省略 `Op-String--op` 中的 `String`, 它能产生正确的弹出元素 null.
因数字是连续的, 所以 `Num-Number` 中不需要 'term', 这样产生的 action 更干净.
因为语法中没有声明启用优先级算法, 所以这并不是预期的四则运算结果.

## Precedences

核心 Actions 支持运算符优先级的处理, 需要定义满足两个条件语法的语法:

1. 添加 PRECEDENCES 规则
2. 使用 prec 方法指示使用优先级算法.

PRECEDENCES 规则采用 ABNF 替代语法, 越靠前优先级越高, 全部由字符串组成, 第一个字符串描述结合性, 后续为运算符.

结合性:

  1. "l" 一元运算左结合
  2. "r" 一元运算右结合
  3. "2" 双元运算

示例: 四则运算, 支持符号位, 支持优先级

```abnf
rules  = Factor---left *(Op-String--op Factor---right)
Factor = Num-Number / "(" rules-Expr ")"
Op     = SumOp / MulOp-Expr-prec
SumOp  = "+" / "-"
MulOp  = "*" / "/"
Num    = *SumOp--term-sign 1*(%x30-39)

PRECEDENCES = "2" "*" "/" /
              "2" "+" "-"
```

其中 `MulOp-Expr-prec` 表示启用优先级, 并生成 `Expr`.
未定义 `SumOp-Expr-prec`, 这样加减法可以省略生成多余的 Expr 对象.

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234