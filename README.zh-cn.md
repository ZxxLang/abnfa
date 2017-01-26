# ABNFA

ABNFA 基于 [ABNF][] 衍生定义了 Actions 语法, 为生成抽象语法树提供工具链.

在原 ABNF 语法中规则是这样定义的:

```abnf
rulename        = ALPHA *(ALPHA / DIGIT / "-")
element         = rulename / group / option /
                  char-val / num-val / prose-val
```

ABNFA 以 "-" 为分隔符重新定义了引用规则, 提供动作处理能力. 部分语法描述:

```abnf
ast            =  1*( rule-Rule-patch-defs-name / (*cwsp cnl) )

name           =  ALPHA *(ALPHA / DIGIT)

rule           =  name---name definedAs elements cnl

defInc         =  "=" / "=/"
definedAs      =  *cwsp defInc--flag *cwsp
elements       =  alternation-Choice-push *cwsp

cnl            =  [comment-Comment-push-comments] CRLF
comment        =  commentLit--term
commentLit     =  ";" *(WSP / VCHAR)

alternation    =  concatenation-Serial-push
                  *(*cwsp "/" *cwsp concatenation-Serial-push)

concatenation  =  repetition *(1*cwsp repetition)

repetition     =  option-Choice / ([repeat-Repeat-rep] element)
repeat         =  1*DIGIT / (*DIGIT "*" *DIGIT)

element        =  ref-Ref / group /
                  charLit-Text / binary-Binary /
                  range-Range / proseLit-Text

group          =  "(" *cwsp alternation-Choice *cwsp ")"

option         =  "[" *cwsp alternation-Choice *cwsp "]"

ref            =  name---ref ["-" action-Action--action]

action         =  [name---produce] [
                  "-" [name---method] [
                  "-" [name---property] [
                  "-" [extra---extra]
                  ]]]
extra          =  ALPHA *(ALPHA / DIGIT / "-")
```

ABNFA 定义的 action 语义:

1. produce   表示要生成对象的类型名称
2. method    处理方法
    1. term      保留方法, 用于终结符, 合并匹配的字符串.
    2. assign    表示对属性赋值一次.
    3. patch     表示属性是个对象, 执行 key/value 赋值
    4. push      表示属性是个数组, 向数组添加元素
    5. true      表示对属性赋布尔值 true
    6. false     表示对属性赋布尔值 false
    7. flag      独立方法, 与其它互斥, 提取匹配字符串到可选参数数组.
3. property  表示被赋值的属性名, 缺省方法名为 assign
4. extra     扩展参数. 目前仅 patch 方法支持 extra 表示的提取 key.

构建 AST 就是逐层生成 produce 节点的过程, 上层生成的 produce 是内层 parent.
action 中的 property 指的是 parent[property], 而最内层的叶子节点由 term 生成.
action 描述了如何生成节点 current 和赋值到 parent[property].

# Actions

ABNFA 核心工具链从文法规则到匹配输入生成一系列对象:

    grammar ->
    core.tokenize -> array of token ->
    core.Entries  -> array of token-group-by-the-rule-based ->
    core.Rules    -> grammar-AST ->
    core.Actions(inputSource) -> array of action

核心工具链最后生成的动作数组即 actions 的元素结构为:

```yaml
start: Number
end: Number
raw: String
action:
  produce: String
  method: String
  property: String
  extra: String
```

start   是该动作匹配输入的开始偏移量.
end     是该动作匹配输入的结束偏移量(不包含 end).
raw     源自保留方法 term.
actions 数组中的 null 元素表示节点回退.

即:

    核心工具链不关心 produce, property, extra, 它们由最终组装器负责.
    核心工具链只构建生成 AST 的动作, 依据 term 保留匹配字符串.
    没有描述 action 的引用规则匹配的字符串被丢弃.

以有两个数值字符串, 以空格分隔的千位数值字符串样本 `0,234 678` 为例.

```abnf
rules     = 1*(thousands-Number-push [SP])
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
- start: 0
  end: 5
  raw: '0234'
  action:
    produce: ''
    method: term
- null
- start: 6
  end: 9
  action:
    produce: Number
    method: push
- start: 6
  end: 9
  raw: '678'
  action:
    produce: ''
    method: term
```

该数组的顺序就是对 AST 构建过程的描述:

0. 生成 Number 对象作为 current 对象, 并 push 到 parent
1. 对 current 进行赋值 raw('0234'), 因 !produce, parent 和 current 不变.
2. 弹出 current, parent 不变
3. 生成 Number 对象作为 current 对象, 并 push 到 parent
4. 对 current 进行赋值 raw('678'),  因 !produce, parent 和 current 不变.

通常生成一个对象显然要对它进行(属性)赋值, 因此 push 到 parent 要到 current 或 parent 发生改变(弹出)时才执行.

上例中因为需要丢弃逗号, 所以使用了 `1*3DIGIT--term`, 下例展示 produce 的作用.

示例: 四则运算

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
  raw: '1'
- start: 0
  end: 1
  action:
    produce: ''
    method: ''
    property: left
- null
- start: 1
  end: 2
  action:
    produce: String
    method: ''
    property: op
  raw: +
- null
- start: 2
  end: 3
  action:
    produce: Number
  raw: '2'
- start: 2
  end: 3
  action:
    produce: ''
    method: ''
    property: right
- null
- start: 3
  end: 4
  action:
    produce: String
    method: ''
    property: op
  raw: '*'
- null
- start: 4
  end: 5
  action:
    produce: Number
  raw: '3'
- start: 4
  end: 5
  action:
    produce: ''
    method: ''
    property: right
```

不能省略 `Op-String--op` 中的 `String`, 它能产生正确的弹出元素 null.
因数字是连续的, 所以 `Num-Number` 中不需要 'term', 这样产生的 action 更干净.
但是显然 actions 不考虑运算符结合性(优先级), 因为它不知道什么是运算符.

即:

    actions 为生成 AST 构建了节点生成边界(顺序), 但不负责(按结合性)组装 AST.

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234