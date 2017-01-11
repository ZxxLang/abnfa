# ABNFA

ABNFA 是 [ABNF][] 的衍生品, 为直接生成抽象语法树定义了 Actions 语法.

在原 ABNF 语法中规则是这样定义的:

```abnf
rulename        = ALPHA *(ALPHA / DIGIT / "-")
element         = rulename / group / option /
                  char-val / num-val / prose-val
```

ABNFA 的 Actions 语法定义(部分):

```abnf
rulelist       =  1*( rule-Rule--push / (*cwsp cnl) )
rule           =  rulename--name definedAs elements cnl

rulename       =  ALPHA *(ALPHA / DIGIT)

defInc         =  "=" / "=/"
definedAs      =  *cwsp defInc---kind *cwsp
elements       =  alternation-Choice--push *cwsp

cnl            =  [comment-Comment-comments-] CRLF
comment        =  ";" commentLit--raw
commentLit     =  *(WSP / VCHAR)

alternation    =  concatenation-Serial--push
                  *(*cwsp "/" *cwsp concatenation-Serial--push)

concatenation  =  repetition *(1*cwsp repetition)

repetition     =  option-Choice / ([repeat-Repeat-rep] element)
repeat         =  1*DIGIT / (*DIGIT "*" *DIGIT)

action         =  1*(ALPHA / DIGIT / "-")
actions        =  rulename--ref
                  ["-" [rulename--produce] [action--action]]

element        =  actions-Ref / group-Choice /
                  charLit-Text / binary-Binary /
                  range-Range / proseLit-Text

group          =  "(" *cwsp alternation---push *cwsp ")"

option         =  "[" *cwsp alternation---push *cwsp "]"
```

即分离了 rulename 和引用 rulename -- Actions, actions 分三部分:

    ref     引用的原规则名, 该名称不能含有 "-"
    produce 通常这是一个类型名称
    action  一个动作, 作用于前一个生成的 produce 对象(prev)

缺省的 action 按照格式区分:

1. 不包含 "-"
    直接赋值 prev.action = produce

2. 包含后缀 "-"
    添加元素 prev.action.push(produce)

3. 包含前缀 "-"
    执行方法 prev.action(produce)

所以 Actions 的语义是:

    当引用的 rulename 匹配成功, 生成一个 produce 并执行 action 作用到 prev.

显然, 第一个规则名所代表的第一个 prev 对象是直接传入的.
后续的依照语法逐层生成, 并成为被引用规则匹配时的 prev.

规则解读:

    rulelist  =  1*( rule-Rule--push / (*cwsp cnl) )
                ; 引用 rule 成功的话 current = new Rule() 并作为 rule 的 prev.
                ; 该 Rule 对象执行当前的 prev 动作 prev.push(current)
    rule      =  rulename--name definedAs elements cnl
                ; 引用 rulename 成功的话, 未生成对象
                ; 那么把 rulename 匹配的字面值 raw 作用于动作 prev.name = raw

显然, 在上例中隐含的 `WSP`, `CRLF` 等完成匹配后就被抛弃了.

通常, 真实算法先全部匹配成功, 记录所有的 produce 和 action 然后执行动作.

# Behaviors

1. 规则被引用时只标记了 produce, 则该规则中必须含有 action.
2. 未标记 action 的引用规则匹配成功后, 匹配的数据被抛弃.

参见前文中的 action, actions, element 规则定义, 在下面的定义中:

```abnf
b        =  "b"
d        =  "d"
x        =  "x"

binLit   = 1*BIT
decLit   = 1*DIGIT
hexLit   = 1*HEXDIG

bin      =  binLit--seqs- [ 1*("." binLit--seqs-) ]
dec      =  decLit--seqs- [ 1*("." decLit--seqs-) ]
hex      =  hexLit--seqs- [ 1*("." hexLit--seqs-) ]

binary   = "%" (b--formal bin / d--formal dec / x--formal hex)

binRange =  binLit--first [ ("-" binLit--last) ]
decRange =  decLit--first [ ("-" decLit--last) ]
hexRange =  hexLit--first [ ("-" hexLit--last) ]

range    = "%" (b--formal binRange / d--formal decRange / x--formal hexRange)
```

执行动作为:

    符号 "%", "." 和 "-" 匹配成功后被抛弃.
    b, d, x 被赋值到属性 prev.formal = raw
    binLit, decLit, hexLit 被添加到属性 prev.seqs.push(raw)

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234