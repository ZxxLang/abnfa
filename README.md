# ABNFA

ABNFA is the derivative of Augmented Backus-Naur Form [ABNF][]
by adding Actions syntax for directly generating abstract syntax trees(AST).

The original syntax specification by ABNF

```abnf
rulename        = ALPHA *(ALPHA / DIGIT / "-")
element         = rulename / group / option /
                  char-val / num-val / prose-val
```

The Actions syntax by ABNFA

```abnf
rulelist       =  1*( rule-Rule--push / (*cwsp cnl) )
rule           =  rulename--name definedAs elements cnl

rulename       =  ALPHA *(ALPHA / DIGIT)

defInc         =  "=" / "=/"
definedAs      =  *cwsp defInc---kind *cwsp
elements       =  alternation-Choice--push *cwsp

cnl            =  [comment-Comment-comments-] CRLF
comment        =  commentLit--raw
commentLit     =  ";" *(WSP / VCHAR)

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

So, separated rulename and reference rulename - Actions.
actions divided into three parts:

    ref         the name of the original rule that is referenced,
                which can not contain "-"
    produce     typically, this is a type name
    action      an action that acts on the previous produce object (prev)

The default action is distinguished by format:

1. the action does not contain "-"
    direct assignment: prev.action = produce

2. the action contains the suffix "-"
    add elements:      prev.action.push(produce)

3. the action contains the prefix "-"
    execution method:  prev.action(produce)


So the semantics of Actions are:

     When the reference rulename match succeeds, generates a produce and executes the action to prev.


Obviously, the first rule name represents the first prev object passed directly.
Subsequent generation according to the syntax layer by layer, and become the reference rules match the prev.

Examples of rules:

```
    rulelist  =  1*( rule-Rule--push / (*cwsp cnl) )
                ; current = new Rule(), when the rule matches successfully.
                ; prev.push(current)
                ; the top-level prev is is passed in as a parameter

    rule      =  rulename--name definedAs elements cnl
                ; prev.name = raw, when the rulename matches successfully.
                ; prev is new Rule()
```

# Behaviors

1. The rule must contain action, when the rule are referenced with only produce.
2. The matching data is discarded, when the rule does not contain action.

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

The actions:

    the symbols "%", "." and "-" are discarded
    the symbols "b", "d", "x" direct assignment: prev.formal = raw
    the binLit, decLit, hexLit is append to the seqs: prev.seqs.push(raw)

In fact, the specific implementation is customizable.

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234