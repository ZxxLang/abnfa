# ABNFA

Augmented BNF Actions(ABNFA) 是基于 [ABNF][] 的扩展, 为生成 AST 提供动作语法支持.

通常语法文件用来描述词法和文法解析, 为了生成 AST 需要嵌入特定语言的动作代码.

因为对解析器来说, 所有节点的类型(结构)必须被确定, 所以可以这样做:

    在语法文件中描述所有节点的结构
    匹配时记录每一个生成节点的动作细节
    全部匹配成功后, 依据这些动作构建整个 AST

ABNFA 与 [ABNF][] 的不同:

1. 第一条规则命名为 `ABNF-Actions`, 描述节点结构等 meta 数据, 语义由实现决定.
1. 第二条规则是正式文法
1. 规则名大小写敏感
1. 增加单引号字符串 `"'" 1*(%x20-26 / %x28-7E) "'"`, 大小写敏感
1. 增加引用动作形式 `refer--action(arguments...)`, `refer` 成功后执行 `action`
1. 保留直接动作形式 `to--action(arguments...)`, 无引用规则直接执行 `action`
1. 取消增量替代语法 `=/` 和预定义 [Core Rules][]
1. 十进制形式   `%d` 只用于 `ABNF-Actions` 中表示立即整数
1. 字符散列形式 `<>` 只用于 `ABNF-Actions` 中表示类型注解
1. 十六进制形式 `%x` 表示 Unicode 代码点
1. 二进制形式   `%b` 表示以 bit 为单位匹配数据
1. 记录行列位置时从 1 起, 列以单个 Unicode 字符为单位

本包是 ABNFA 的 JavaScript 实现, 定义参见 [ABNFA Definition of ABNFA][].

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

[Sublime Text 3 ABNF 语法高亮插件][ABNF-sublime-syntax]

## Install

```sh
yarn install abnfa
```

## Usage

返回值取决于你的文法定义. 技术细节参见 [DEVELOPERS](DEVELOPERS.md)

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

参见 [ABNFA Definition of ABNFA][], 一个 ABNFA 文法会生成一个 meta 实例, 包括
了所有的节点类型描述, 特定配置以及自定义配置. meta 就是 ABNFA 生成的 AST.

在 `ABNF-Actions` 中的配置以 `to-` 开头, 否则是节点类型描述.

例: 详见 [JSON.abnf][]

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

多数 `Action` 是对类型的描述, 这使得 ABNFA 兼具节点类型描述能力.

### repeat

在以下形式中:

1. `*refer--action`    action 总是被执行
1. `[refer--action]`   refer  成功 1 次后执行 action
1. `min*refer--action` refer  成功 >=min 次后执行 action

### mixins

mixins 是为混入字段提供的便捷语法糖.

下例中的 `repeat mixins` 等同 `min %d1` 和 `max %d1`.

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

可为 STRING, BOOL, INT 类型字段设置缺省值.

例:

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

配置允许值为 `null` 的通用类型名称列表.

    to-nullable <BOOL,STRING>

不同语言对某类型是否允许值为 `null` 存在差异, 对于 JavaScript 来说没有限制.
所以本实现不会检查该配置, 其它语言可能需要它.

### to-typefield

配置保存类型名称的字段名, 缺省值 'type', 空 '' 表示不保存.

    to-typefield 'type'

### to-locfield

配置保存定位信息的字段名, 缺省值 'loc', 空('')表示不保存.

    to-locfield 'loc'

### to-crlf

配置换行符, 缺省值 '' 表示自动识别.

    to-crlf '\n'
    to-crlf '\r'
    to-crlf '\r\n'

### to-indent

配置行首缩进符号. 缺省为 '' 自动提取第一个缩进符.

    to-indent ' '
    to-indent '\t'

### to-mode

配置数据源类型.

    to-mode string
    to-mode byte
    to-mode bits

1. string 缺省值, 表示数据源为字符串.
1. byte 表示数据源为 Uint8Array 或 byte(整数) 数组, 以字节为单位匹配数据.
1. bits 支持位匹配 `%b` 的 byte 模式, 不附加数据偏移量和行列信息

在 bits 模式下匹配字符或字符串时必须以 8bit 对齐.

也就是说在 bits 模式下必须使用连续的位匹配形式 `%b` 保持 8bit 对齐.

### to-infix

以固定写法配置二元中缀表达式节点名称以及运算符优先级. 示例:

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

示意例子:

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

注意 `factor` 中无需包含 `BinaryExpr`, 构建时会生成它.

## Actions

Action 是附加参数的引用, 描述如何处理数据, 比如节点类型和分配到父节点的字段.

两种形式的动作中多数的 `action` 是类型名. 详见下文.

    to--action
    to--action(arguments...)
    refer--action
    refer--action(field, arguments...)

例:

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

### 通用类型

除了在 meta 中自定义类型外, 本包支持下列通用类型:

1. BOOL     布尔
1. BYTE     一个字节, 本实例下被转换为 INT
1. RUNE     一个有效 Unicode 代码点, 本实例下被转换为 INT
1. STRING   字符串
1. INT      整型家族 I8, I16, I32, I64, U8, U16, U32, U64
1. FLOAT    类型家族 F32, F64, F128, F256
1. BYTES    直接存储二进制原始数据, `x BYTES`
1. ARRAY    数组, `x ARRAY<element-type>`
1. UNIQUE   数组, `x UNIQUE<element-type>`, 无重复元素值
1. OBJECT   键值为字符串的 Key-Value 对象, `x OBJECT<Value-type>`

### field-prefix

分配一个节点到上级节点的某个字段时可以使用字段前缀:

1. /  根节点作为目标父节点, 且必须拥有指定字段
1. ?  向上追溯拥有指定字段父节点

ARRAY, UNIQUE, OBJECT 不接收具有字段前缀的数据.

### refer--ARRAY

生成通用 ARRAY 实例, 忽略子元素的 `field` 值.

    refer--ARRAY
    refer--ARRAY(field)

直接使用添加元素到 ARRAY 的形式更利于类型检查.

    refer--element-type(ARRAY-field)

即当目标是 ARRAY 时有两种方式可选:

1. 一次生成 refer--ARRAY(field)
1. 添加元素 refer--element-type(ARRAY-field)

### refer--UNIQUE

生成通用 UNIQUE 实例, 忽略子元素的 `field` 值.

    refer--UNIQUE
    refer--UNIQUE(field)

允许直接添加元素类型到 UNIQUE

    refer--element-type(UNIQUE-field)

即当目标是 UNIQUE 时可选方式:

1. 一次生成 refer--UNIQUE(field)
1. 添加元素 refer--element-type(UNIQUE-field)

子元素类型可以是: BOOL, BYTE, RUNE, STRING, INT 家族, FLOAT 家族

### refer--OBJECT

生成键值为字符串的 Key-Value 对象.

    refer--OBJECT
    refer--OBJECT(field)

在 refer 内部生成(多对儿)特定 `key`, `val` 字段记录.

    in-refer--STRING(key)
    in-refer--val-type(val)

如果 field 已存在, 合并 Key-Value.

### refer--BYTES

生成通用 BYTES 实例, 保存匹配的二进制原始数据.

    refer--BYTES
    refer--BYTES(field, decode)

解码器参数 decode 在 `string mode` 下是必须的.

### refer--RUNE

用于 Unicode 码点数据, 检查码点合法性. 格式参见 `to-refer--INTx`.

### refer--TIME

生成通用通用 TIME 实例.

    refer--TIME
    refer--TIME(field, decode)

TIME 的具体值(结构)由 decode 决定, 本实例默认采用 `new Date(source)` 生成.

### to--true

设置字段值为布尔 `true`.

    to--true
    to--true(field)

### to--false

设置字段值为布尔 `false`.

    to--false(field)

### to--null

设置字段值为 `null`.

    to--null(field)

### to--Infinity

设置 FLOAT 类型家族字段值为 ±Infinity.

    to--Infinity(field)
    to--Infinity(field, -)

### to--NaN

设置 FLOAT 类型家族字段值为 NaN.

    to--NaN(field)

### to--discard

丢弃(移除,弹出)前一个动作.

    to--discard

### to--type

确认当前节点的类型, 参见 `refer--pending`.

    to--type(typename)

### refer--pending

当 `refer` 生成的类型在内部通过 `to--type` 确定时使用.

    refer--pending
    refer--pending(field)

必须在 `refer` 内部使用 `to--type` 确定 `typename`.

例: 减少匹配回退次数

```abnf
example = number--pending
number =
  1*DIGIT (
      '.' 1*DIGIT to--type(FLOAT)
    / to--type(INT)
  )
```

配合 `to--discard` 减少不必要的树层级深度, 参见 [ABNFA Definition of ABNFA][]

### to-refer--STRING

生成通用 STRING 到字段, 支持解码和字符串拼接.

    to--STRING(field, string-value)
    to--STRING(field, 'string value')
    to--STRING(field, string-value, concat)
    refer--STRING
    refer--STRING(field, decode)
    refer--STRING(field, decode, concat)

内建的 decode:

1.`unescape` 表示对对 `\` 开始的 [转义字符][Escape_character] 进行反转义

concat 表示和之前的数据(而不是缺省值)进行拼接, 可选值:

1. `suffix` 向尾部拼接, 如果找到 field 记录
1. `prefix` 向头部拼接, 如果找到 field 记录
1. 其它不拼接

### to-refer--INT

生成通用 INT 类型家族数据到字段.

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

其中

1. radix 值为 2,8,10,16 的基数(进制), 缺省为 10.
1. `LE`  二进制小尾序 Little-Endian
1. `BE`  二进制大尾序 Big-Endian
1. `ME`  二进制混合序 Middle-Endian

本实现支持的值范围: `Number.MIN_SAFE_INTEGER` 至 `Number.MAX_SAFE_INTEGER`

### to-refer--FLOAT

生成通用 FLOAT 类型家族数据到字段.

    to--FLOAT(field, -1.0)
    to--FLOAT(field, 1.0E10)
    to--FLOAT(field, 1.0e10)
    refer--FLOAT
    refer--FLOAT(field)
    refer--FLOAT(field, decode)

其中 `decode` 表示解码算法: 参见 [IEEE 754][]

1. `default`  Base 10 浮点数字符串, 缺省值.
1. `binary`   2,4,8,16,32 字节比特序列, Base 2  交换格式
1. `decimal`  2,4,8,16,32 字节比特序列, Base 10 交换格式

### to--copy

拷贝已有字段的值到新字段.

    to--copy(existing-field, new-field)

### to--move

更改当前节点内所有指定的字段名为另外的名字.

    to--move('', another-field)
    to--move(field, another-field)
    to--move(field, '')

### to--turn

规则转移.

    to--turn(rulename, another-rulename)

转移后引用 `rulename` 规则时会转向引用 `another-rulename`.
当 `another-rulename` 等于 `rulename` 时表示回迁, 恢复正常的引用.

### to--fault

结束匹配并返回(抛出)错误信息, 后缀当前的行列位置, 总长度不超过 60 列.

    to--fault('message ...')
    to--fault('message ...', -10)
    to--fault('message %s ...')
    to--fault('message %q ...')
    to--fault('message %s ...', offset)
    to--fault('message %q ...', offset)

如果包含 `%s` 或 `%q`, 从 `offset` 位置提取原始数据.

1. `%s`     提取原始字符串
1. `%q`     用双引号包裹提取原始字符串并的转义空白字符
1. `offset` 负数偏移字符量或已生成的字段名. 缺省值为 0, 即当前位置.

输出举例:

    Illegal configuration to-infix:10:4
    Unclosed double quotes to-:100:4

### to--eol

依照 `to-crlf` 的配置匹配换行符并记录行列位置信息.

    to--eol

### to--indent

匹配行首缩进, 适用于缩进语法的语言.

    to--indent        初次探测缩进或缩进大于父节点, 等同 '>>'
    to--indent('>>')  缩进大于父节点
    to--indent('>1')  缩进比父节点多 1
    to--indent('>=')  缩进不小于父节点, 大于等于
    to--indent('==')  缩进等于节点
    to--indent('<=')  缩进小于等于父节点
    to--indent('<1')  缩进比父节点少 1
    to--indent('<<')  缩进小于父节点

通常除了首行缩进 `to--indent` 应该在 `to--eol` 后使用.

例如:

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

以 Unicode 通用分类名匹配数据, 参见 [tr44][].

    to--unicode(General-Category)

例如:

    to--unicode(Letter)
    to--unicode(Lo,Lu)

*NodeJS 环境需要启用参数 `--harmony_regexp_property`*

## License

BSD 2-Clause License

Copyright (c) 2018, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234
[Core Rules]: https://tools.ietf.org/html/rfc5234#appendix-B.1
[tr44]: https://www.unicode.org/reports/tr44/#GC_Values_Table
[Base64]: https://tools.ietf.org/html/rfc4648#section-4
[IEEE 754]: https://en.wikipedia.org/wiki/IEEE_754
[ABNFA Definition of ABNFA]: https://github.com/ZxxLang/abnfa/blob/master/grammar/abnfa.abnf
[JSON.abnf]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json.abnf
[JSON parser]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json-parser.abnf
[DEVLOPERS.md]: https://github.com/ZxxLang/abnfa/blob/master/DEVLOPERS.md
[ABNF-sublime-syntax]: https://github.com/ZxxLang/ABNF-sublime-syntax