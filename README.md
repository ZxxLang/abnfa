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
Rules           = 1*( Rule-defs-array / (*WSP CRLF) )

name            = ALPHA *(ALPHA / DIGIT)   ; define
actions         = *("-" name)              ; Actions
Ref             = name-ref actions-actions ; define action

Rule            = name-name cwsp ( "=" / "=/" ) cwsp elements cnl

element         = Ref-refs-array / group / option /
                  Literal / numVal / numRange / proseVal


elements        = Alternation cwsp
cwsp            =  *(WSP / (cnl WSP))
cnl             =  Comment-comments-array / CRLF
Comment         =  ";" *(WSP / VCHAR) CRLF
; ...
Literal         = insensitive / sensitive
insensitive     = [ "%i" ] quotedString
s               = "%s"
sensitive       = s-sensitive-true quotedString
quotedString    = DQUOTE runes-text DQUOTE
runes           = *(%x20-21 / %x23-7E)
; ...
```

The behavior of the actions is determined by the concrete implementation.

The default behavior described above is to assign properties:

```
Rules           =>
                    Rules {} => left-node
Rule-defs-array =>
                    Rule {}  => this-node
                    left-node.defs.push(this-node)
Ref             =>
                    Ref {} => left-node
                    name-ref => name {} => this-node
                    left-node.ref = this-node
                    actions-actions => this-node
                    left-node.actions = this-node
Ref-refs-array  =>
                    element => left-node
                    Ref {} => this-node
                    left-node.refs.push(this-node)
s-sensitive-true=>
                    Literal {} => left-node
                    left-node.sensitive = true
rune-text      =>
                    rune => this-node
                    Literal {} => left-node
                    left-node.text = this-node
```

# Behaviors

1. Terminal is elements without actions in depth recursion.
2. Element is elements with actions.
3. Discard Terminal in Element.
4. All Terminal  are connected as string rule object.
5. All Element are merged to generate rule object.

```abnf
b               =  "b"
d               =  "d"
x               =  "x"
bin             = 1*BIT
dec             = 1*DIGIT
hex             = 1*HEXDIG

Range           =  "%" (binRange / decRange / hexRange)
binRange        =  b--formal bin-first "-" bin-last
decRange        =  d--formal dec-first "-" dec-last
hexRange        =  x--formal hex-first "-" hex-last

Num             =  "%" (binLit-text / decLit-text / hexLit-text)
binLit          =  b bin [ 1*("." bin)]
decLit          =  d dec [ 1*("." dec)]
hexLit          =  x hex [ 1*("." hex)]
```

A JavaScript implementation of the Range and Num:

```js
function Range (element) {
    var prefix = element.format=='d' ? '' : '0' + element.format;
    this.first = Number(prefix+element.first)
    this.last = Number(prefix+element.last)
}

function Num (element) {
    this.text = Number(element[0] == 'd' && element.slice(1) || '0' + element)
}
```

Terminal symbols "%" and "-" are discarded.

So, generates an AST from ABNFA directly.

In fact, the specific implementation is customizable.

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234