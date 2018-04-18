# ABNFA

Augmented BNF Actions(ABNFA) is an extension based on [ABNF][],
provides action syntax support for generating AST.

The usual grammar file is used to describe lexical and grammatical parsing,
in order to generate an AST need to embed a specific language of the action code.

Because the type (structure) of all nodes must be determined for the parser,
you can do so:

    Describe the structure of all nodes in a grammar file
    Record the action details of each generated node in the match
    Build the entire AST based on these actions after all matches

Difference between ABNFA and [ABNF][]:

1. The first rule is named `Abnf-actions`, describes meta data such as node structure.
1. The second rule is the formal grammar.
1. Rule name is case sensitive.
1. Add single quote string `"'" 1* (%x20-26/%x28-7e) "'"`, case-sensitive.
1. Add Reference Action form `refer--action (arguments ...)`, executing `action` after `refer` matches.
1. Keep Direct Action form `to--action (arguments ...)`, executes `action` without the reference rule.
1. Cancel increment substitution syntax `=/` and pre-defined [Core rules][].
1. The dec-val `%d` is used only in `Abnf-actions` to denote immediate integers.
1. The prose-val `<>` is used only in `Abnf-actions` to represent type-annotation.
1. The hex-val `%x` represents the Unicode code-point.
1. The bin-val `%b` means matching data in bit units.
1. Record row and column positions from 1, columns in single Unicode character.

This package is a JavaScript implementation of ABNFA. See [ABNFA Definition of ABNFA][] for definition.

```abnf
ABNF-Actions =
  to-language  'Hello world'
  HelloWorld ARRAY<STRING>

grammar= syntax--ARRAY
syntax = 1*(*SP hello--STRING *SP  world--STRING)
hello  = "hello"
world  = "world"
SP     = ' '
```

[ABNF syntax highlighting for Sublime Text 3][ABNF-sublime-syntax]

## Install

```sh
yarn install abnfa
```

## Usage

The return value depends on your grammar definition. See [DEVELOPERS](DEVELOPERS.md)

```javascript
let
  aa = require('abnfa'),
  meta = aa.parse(source_of_ABNFA).build();

// If you are not expecting null
if(!meta) {
  throw Error('Parsed successfully but the result is null');
}

// Compile to JavaScript source code

let code = aa.jscoder(
  aa.patternize(meta.formnames, meta.formulas)
);

// Do something
//
// console.log(code);
// fs.writeFileSync('path/xxx.js', code);
// let coder = require('path/xxx');
//
// .... or

let
  coder = Function('exports', code + ';return exports;')({}), // jshint ignore:line
  creator = aa.builder(coder);

creator.parse(your_source);
```

## ABNF-Actions

See [ABNFA Definition of ABNFA][], A ABNFA grammar generates a meta instance,
including All node type descriptions, specific configurations,
and custom configurations. Meta is the AST that ABNFA generates.

The configuration in ' Abnf-actions ' begins with ' to-',
otherwise the node type description.

Example: See [JSON.abnf][]

```abnf
ABNF-Actions =
  ; Custom configuration
  to-language 'JSON'
  to-fileTypes ['json']
  to-scopeName 'source.json'
  to-description 'JSON to AST'

  ; Specific configuration
  to-locfield    'loc'   ; The field-name of location
  to-typefield   'type'  ; The field-name of type

  ; AST node type described.

  ; Structure
  Object (
    ; Fields Description.
    children  ARRAY<Property>
  )

  Array (
    children ARRAY<Object, Array, Literal>
  )

  Literal (
    value <null, BOOL, STRING, INT, FLOAT>
  )

  Identifier  (
    ; Declaration STRING type with initial value
    value  ''
  )

  Property    (
    key   <Identifier>
    value <Object, Array, Literal>
  )

JSON-text = ws value ws

value = object--Object(value)
      / array--Array(value)
      / string--Literal(value)
      / number--Literal(value)
      / boolean--Literal(value)
      / null--Literal(value)
; omitted...
```

Most `Action` is a description of the type,
which makes ABNFA the ability to describe the node type.

### repeat

In the following form:

1. `*refer--action`    action is always executed
1. `[refer--action]`   action to be executed after refer successful 1st
1. `min*refer--action` action to be executed after refer successful >=min

### mixins

mixins is sugar for mixed fields.

In the following example `repeat mixins` same as `min %d1` and `max %d1`.

```abnf
ABNF-Actions =
  literal (
    ; mixin type or embed type
    repeat  mixins
    value   ''
    ; Declaration BOOL type with initial value
    sensitive true
  )

  action  (
    repeat  mixins
    refer   ''
    name    ''
    args    array<STRING>
  )

  repeat  (
    ; Declaration INT type with initial value
    min %d1
    max %d1
  )
```

### default-value

The default value can be set for STRING, BOOL, INT type fields.

Example:

```abnf
ABNF-Actions =
  type (
    b true      ; The default value is BOOL true
    i %d1       ; The default value is INT 1
    s ''        ; The default value is STRING ''
    n <STRING>  ; There is no default value
  )
```

### to-nullable

Configure a list of common type names that allow values of `null`.

    to-nullable <BOOL,STRING>

There are differences between languages on whether a type allows `null`,
and there is no limit to JavaScript. Other languages may need it.

### to-typefield

Configure the name of the field that holds the name of the type.
The default value is 'type'. Empty '' indicates no saving.

    to-typefield 'type'

### to-locfield

Configure the name of the field that holds the name of the type.
The default value is 'type'. Empty('') indicates no saving.

    to-locfield 'loc'

### to-crlf

Configure line breaks, default '' for automatic identification.

    to-crlf '\n'
    to-crlf '\r'
    to-crlf '\r\n'

### to-indent

Configure the first line of indentation. The default is '' means
the first indent is automatically extracted.

    to-indent ' '
    to-indent '\t'

### to-mode

Configure data source type.

    to-mode string
    to-mode byte
    to-mode bits

1. string The default value indicates that the data source is a string.
1. byte   The data source is Uint8Array or byte (integer) array.
1. bits   Supports byt-mode for bit matching `%b`.

Matching characters or strings in bits-mode must be 8bit aligned.

### to-infix

Configure two-dollar infix expression node name and operator precedence.

Example:

```abnf
ABNF-Actions =
  to-description  'Binary infix expression'

  to-infix (
    node     'BinaryExpr'
    left     'x'
    operator 'op'
    right    'y'
    priority [
      ; Highest to lowest priority
      [ '*' / '/' ]
      [ '+' / '-' ]
      [ 'AND' ]
      [ 'OR' ]
    ]
  )

  BinaryExpr (
    x   <Expr>
    op  ''
    y   <Expr>
  )

  Expr <BinaryExpr, UnaryExpr, Number, String, CallExpr, DotExpr, IndexExpr>
  ; omitted ...
```

Schematic example:

```abnf
expr =
  factor (
    1*(operator factor) to--type(BinaryExpr)
  )

factor =
    group--pending
  / UnaryExpr / Number / String / CallExpr / DotExpr / IndexExpr

group = '(' expr ')'

```

Note that `factor` does not need to contain `binaryexpr` and builds it.

## Actions

An Action is a reference to an additional parameter that describes how to work
with data, such as the node type and the fields assigned to the parent node.

Most of the `action` in both forms of action is the type name.
See below for details.

    to--action
    to--action(arguments...)
    refer--action
    refer--action(field, arguments...)

Example:

```abnf
ABNF-Actions =
  to-language  'ABNFA'
  ; omitted ...
  action  (
    repeat  mixins
    refer   ''  ; rulename or 'to'
    name    ''  ; typename or action-method
    factor  ARRAY<STRING>
  )

; omitted ...

action  =
  rulename--STRING(refer) ['--' (
      1*ALPHA--STRING(name) [
        '(' *SP argument *(*SP ',' *SP argument ) *SP ')'
      ]
    / to--fault('Invalid action of %s', refer)
  )]

argument =
    "'" *quotes-vchar--STRING(factor, unescape) "'"
  / number-val--pending(factor)
  / field--STRING(factor)
  / to--fault('Invalid arguments on %s', refer)

quotes-vchar =
    %x20-21 / %x23-26 / %x28 / %x2A-5B / %x5D-7E
  / '\' (
      '"' /          ; quotation mark  U+0022
      "'" /          ; quotation mark  U+0027
      '\' /          ; reverse solidus U+005C
      'x' 2HEXDIG /  ; xXX             U+XX
      'u' (          ; uXXXX           U+XXXXXX
        '{' 1*6HEXDIG '}' /
        4HEXDIG
      )
    )
  ; ')' = '\u0029'

field-prefix = ['/' / '?']

field = field-prefix ALPHA *(ALPHA / DIGIT / '-' / '_')
; omitted ...
```

### Common-types

In addition to customizing types in meta,
this package supports the following common types:

1. BOOL     Boolean
1. BYTE     A byte that is converted to INT in this implementation
1. RUNE     A Unicode code-point that is converted to INT in this implementation
1. STRING   String
1. INT      Integral family: I8, I16, I32, I64, U8, U16, U32, U64
1. FLOAT    Float family: F32, F64, F128, F256
1. BYTES    Direct storage of binary raw data
1. ARRAY    Array, `x ARRAY<element-type>`
1. UNIQUE   An array without duplicate element values, `x UNIQUE<element-type>`
1. OBJECT   Key-value object with String key, `x OBJECT<Value-type>`

### field-prefix

Field prefixes can be used when assigning a node to a field in a parent node:

1. /  The root node is the target parent node and must have the specified field
1. ?  Trace up the parent node of the specified field

The ARRAY, UNIQUE and OBJECT does not receive data with field prefix.

### refer--ARRAY

To generate a common ARRAY instance, Ignore `field` of child element.

    refer--ARRAY
    refer--ARRAY(field)

Directly using the form of adding elements to ARRAY is more beneficial
to type checking.

    refer--element-type(ARRAY-field)

That is, when the target is ARRAY, there are two ways to choose:

1. Generates an array at once: refer--ARRAY(field)
1. Add an element: refer--element-type(ARRAY-field)

### refer--UNIQUE

To generate a common UNIQUE instance, Ignore `field` of child element.

    refer--UNIQUE
    refer--UNIQUE(field)

Directly using the form of adding elements to UNIQUE is more beneficial
to type checking.

    refer--element-type(UNIQUE-field)

That is, when the target is UNIQUE, there are two ways to choose:

1. Generates an unique array at once: refer--UNIQUE(field)
1. Add an element: refer--element-type(UNIQUE-field)

子元素类型可以是: BOOL, BYTE, RUNE, STRING, INT 家族, FLOAT 家族

### refer--OBJECT

The Key-value object that generates the STRING as a key.

    refer--OBJECT
    refer--OBJECT(field)

Generated internally (refer)-specific `key`, `val` field records.

    in-refer--STRING(key)
    in-refer--val-type(val)

If `field` already exists, merge Key-value.

### refer--BYTES

Generates a generic BYTES instance that holds matching binary raw data.

    refer--BYTES
    refer--BYTES(field, decode)

Decoder parameter decode is required under string-mode.

### refer--RUNE

For Unicode code-point, check code-point legality. See `to-refer--INTx`.

### refer--TIME

To generate a generic common time instance.

    refer--TIME
    refer--TIME(field, decode)

TIME's specific value (structure) is determined by decode, `new Date(source)` is default.

### to--true

Set field value to BOOL `true`.

    to--true
    to--true(field)

### to--false

Set field value to BOOL `false`.

    to--false(field)

### to--null

Set field value to `null`.

    to--null(field)

### to--Infinity

Set FLOAT-family field value to ±Infinity.

    to--Infinity(field)
    to--Infinity(field, -)

### to--NaN

Set FLOAT-family field value to NaN.

    to--NaN(field)

### to--discard

Discard (remove, eject) previous action.

    to--discard

### to--type

Confirm the type of the current node. See `refer--pending`.

    to--type(typename)

### refer--pending

Used when the `refer` generated type is determined by the internal `to--type`.

    refer--pending
    refer--pending(field)

`To--type` must be used within `refer` to determine type-name.

Example:

```abnf
example = number--pending
number =
  1*DIGIT (
      '.' 1*DIGIT to--type(FLOAT)
    / to--type(INT)
  )
```

Reduce level depth with `to--discard`, See [ABNFA Definition of ABNFA][]

### to-refer--STRING

Generates a generic STRING value to a field that supports decoding and string concatenation.

    to--STRING(field, string-value)
    to--STRING(field, 'string value')
    to--STRING(field, string-value, concat-dir)
    refer--STRING
    refer--STRING(field, decode)
    refer--STRING(field, decode, concat-dir)

Built-in decode:

1.`unescape` Decode a STRING with [Escape_character][]

Support and previous data stitching (not defaults), Optional concat-dir:

1. `suffix` To the tail stitching if a field record is found
1. `prefix` Stitching to the head if a field record is found
1. Other not stitching

### to-refer--INT

Generates a generic INT-family value to a field

    to--I8(field, -1)
    to--BYTE(field, 1)
    to--U64(field, 10000)
    to--INT(field, -1)
    refer--INT
    refer--U8
    refer--BYTE
    refer--INT(field, radix)
    refer--INT(field, LE)
    refer--INT(field, BE)
    refer--INT(field, ME)

Options:

1. radix The value is the base of the 2,8,10,16, which defaults to 10.
1. `LE`  Little-Endian under byte-mode or bits-mode
1. `BE`  Big-Endian under byte-mode or bits-mode
1. `ME`  Middle-Endian under byte-mode or bits-mode

The range of values supported by this implementation: `Number.MIN_SAFE_INTEGER` to `Number.MAX_SAFE_INTEGER`

### to-refer--FLOAT

Generates a generic FLOAT-family value to a field

    to--FLOAT(field, -1.0)
    to--FLOAT(field, 1.0E10)
    to--FLOAT(field, 1.0e10)
    refer--FLOAT
    refer--FLOAT(field)
    refer--FLOAT(field, decode)

Built-in decode: 参见 [IEEE 754][]

1. `default`  Decimal floating-point number string, default decode.
1. `binary`   binary floating-point data
1. `decimal`  decimal floating-point data

### to--copy

Copy the value of an existing field to a new field.

    to--copy(existing-field, new-field)

### to--move

Change all specified field names in the current node with a different name.

    to--move('', another-field)
    to--move(field, another-field)
    to--move(field, '')

### to--turn

Rule transfer.

    to--turn(rulename, another-rulename)

The `rulename` rule is referred to `another-rulename` when it is transferred.
Returns a normal reference when `another-rulename` equals `rulename`.

### to--fault

Ends the match and returns (throws) the error message,
the current row and column position of the suffix,
with a total length of no more than 60 columns.

    to--fault('message ...')
    to--fault('message ...', -10)
    to--fault('message %s ...')
    to--fault('message %q ...')
    to--fault('message %s ...', offset)
    to--fault('message %q ...', offset)

If you include `%s` or `%q`, extract raw data from `offset`.

1. `%s`     Extract the original strings
1. `%q`     Extract the original string with double quotes
1. `offset` Negative offsets or an existing field. default is the current position.

Output example:

    Illegal configuration to-infix:10:4
    Unclosed double quotes to-:100:4

### to--eol

Match line breaks according to `to-crlf` configuration and record line
and column position information.

    to--eol

### to--indent

Match line indentation, language for indentation syntax.

    to--indent        which is equivalent '>>'
    to--indent('>>')  Indentation is greater than the parent node
    to--indent('>1')  Indent more than parent 1
    to--indent('>=')  Indentation is not less than the parent node
    to--indent('==')  Indentation equals parent
    to--indent('<=')  Indentation is less than or equal to the parent node
    to--indent('<1')  Indent less than parent 1
    to--indent('<<')  Indentation is less than the parent node

Usually in addition to the first line indent `to--indent` should be used
after `to--eol`.

Example:

```abnf
first-indent =
  2SP to--indent  / HTAB to--indent

IF =
  'if' 1*SP cond-expr  1*SP 'then'
    to--eol to--indent('>1') body
  to--eol to--indent('==') 'end' to--eol

ARRAY =
  '[' [INDENT-GT] expr *(',' [INDENT-GT] expr) [INDENT-EQ] ']'
```

### to--unicode

Matching Data with Unicode Generic-Classification Names. See [tr44][].

    to--unicode(General-Category)

Example:

    to--unicode(Letter)
    to--unicode(Lo,Lu)

*Need to enable parameters in NodeJS `--harmony_regexp_property`*

## License

BSD 2-Clause License

Copyright (c) 2018, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234
[Core Rules]: https://tools.ietf.org/html/rfc5234#appendix-B.1
[tr44]: https://www.unicode.org/reports/tr44/#GC_Values_Table
[Base64]: https://tools.ietf.org/html/rfc4648#section-4
[Escape_character]: https://en.wikipedia.org/wiki/Escape_character
[IEEE 754]: https://en.wikipedia.org/wiki/IEEE_754
[ABNFA Definition of ABNFA]: https://github.com/ZxxLang/abnfa/blob/master/grammar/abnfa.abnf
[JSON.abnf]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json.abnf
[JSON parser]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json-parser.abnf
[DEVLOPERS.md]: https://github.com/ZxxLang/abnfa/blob/master/DEVLOPERS.md
[ABNF-sublime-syntax]: https://github.com/ZxxLang/ABNF-sublime-syntax