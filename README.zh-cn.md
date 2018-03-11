# ABNFA

Augmented BNF Actions(ABNFA) 是基于 [ABNF][] 的扩展, 为生成 AST 提供动作语法支持.

通常语法文件用来描述词法和文法解析, 为了生成 AST 需要嵌入特定语言的动作代码.

事实上对于 AST 来说所有的节点类型(结构)是确定的, 可以这样做:

    在语法文件中描述所有节点的结构
    生成根节点作为当前节点
    匹配成功, 使用动作语法保存数据到某个字段
    如果该字段是结构体则作为新的当前节点, 重复此过程生成 AST

所以 ABNFA 集合了数据匹配, 语法解析, 节点生成并装配生成 AST 根节点.

概要: 详见 [ABNFA Definition of ABNFA][]

1. 首条规则名为 `ABNF-Actions-Metadata`, 使用特别的语义描述配置和节点结构
1. 规则名大小写敏感, 保留规则名 `to`.
1. 增加动作语法, 增加单引号字符串形式, 大小写敏感
1. 取消增量替代语法 `=/`, 和预定义 [Core Rules][]
1. 十进制形式   `%d` 只用于 Metadata 中表示立即整数
1. 字符散列形式 `<>` 只用于 Metadata 中表示类型注解
1. 十六进制形式 `%x` 表示 Unicode 代码点
1. 二进制形式   `%b` 表示以字节为消耗数据, 与其它形式不共存
1. 保留通用类型和常量值
1. 记录行列位置时从 1 起, 列以单个 Unicode 字符为单位

```abnf
ABNF-Actions-Metadata =
  to-language  'Hello world'
  HelloWorld ARRAY<STRING>

source = 1*(*SP hello--STRING *SP  world--STRING)
hello  = "hello"
world  = "world"
SP     = ' '
```

## Install

本包是 ABNFA 的 JavaScript 实现.

```sh
yarn install abnfa
```

## Usage

```javascript
let
  aa = require('abnfa'),
  metadata = aa.parse(source);

if(!metadata) {
  throw aa.error;
}

```

## Metadata

Metadata 中的配置以 `to-` 开头, 否则是节点描述.

下面的例子展示了 Metadata 的格式.

```abnf
ABNF-Actions-Metadata =
  ; Custom configuration
  to-language 'JSON'
  to-fileTypes ['json']
  to-scopeName 'source.json'
  to-description 'JSON to AST'

  ; Specific configuration
  to-locname    'loc'   ; The field-name of location
  to-typename   'type'  ; The field-name of type

  ; AST node type described.

  ; First describe the root node.
  value <Object / Array / Literal>

  ; Structure
  Object (
    ; Fields Description.
    children  ARRAY<Property>
  )

  Array (
    children ARRAY<Object / Array / Literal>
  )

  Literal (
    value <null / BOOL / STRING / INT / FLOAT>
  )

  Identifier  (
    ; Declaration STRING type with initial value
    value  ''
  )

  Property    (
    key   <Identifier>
    value <Object / Array / Literal>
  )
```

嵌入(不支持嵌套)字段或类型注解以 `*` 开头, 为共有字段提供了的便捷语法.

下例中的 `*repeat` 是嵌入字段, 等同 `min %d1 max %d1`.

```abnf
ABNF-Actions-Metadata =
  literal (
    ; mixin type or embed type
    *repeat
    value   ''
    ; Declaration BOOL type with initial value
    sensitive true
  )

  action  (
    *repeat
    refer ''
    name  ''
    args  ARRAY<STRING>
  )

  repeat  (
    ; Declaration INT type with initial value
    min %d1
    max %d1
  )
```

### 保留通用类型

1. BYTES    直接存储二进制原始数据, `x BYTES`
1. BOOL     布尔, 支持 `null`
1. INT      整型家族 I8, I16, I32, I64, I128, U8, U16, U32, U64, U128
1. RUNE     值是 U32 表示的有效 Unicode 代码点
1. FLOAT    类型家族 F32, F64, F128
1. STRING   字符串, 支持 `null`
1. ARRAY    数组, `x ARRAY<element-type>`
1. UNIQUE   数组, `x UNIQUE<element-type>`, 无重复元素值
1. OBJECT   键值为字符串的 Key-Value 对象, `x OBJECT<Value-type>`
1. MAP      键值任意类型的 Key-Value 对象, `x MAP<Value-type>`
1. PROPERTY 表示 OBJECT, MAP 的一个元素(项)

*通用类型不会附加 `type` 和 `loc` 字段*

### to-typename

配置保存类型名称的字段名, 缺省值 'type', 空 '' 表示不保存.

    to-typename 'type'

### to-locname

配置保存定位信息的字段名, 缺省值 'loc', 空 '' 表示不保存.

    to-locname 'loc'

### to-crlf

配置换行符, 缺省值 '' 表示自动识别.

    to-crlf '\n'
    to-crlf '\r'
    to-crlf '\r\n'

### to-indent

配置一致的行首缩进符号. 缺省为 `''` 自动提取第一个缩进符.

    to-indent ' '
    to-indent '\t'

### to-mode

配置数据源匹配模式. 缺省为 `string`.

    to-mode 'byte'
    to-mode 'string'

### to-infix

以固定写法配置二元中缀表达式节点名称以及运算符优先级. 示例:

```abnf
ABNF-Actions-Metadata =
  to-description  'Binary infix expression'

  to-infix (
    types    ['BinaryExpr']
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
  ; omitted ...
```

该配置与 [to--infix](#to--infix) 配合使用

## Actions

Action 是附加参数的引用, 描述如何处理数据和装配字段.

```abnf
ABNF-Actions-Metadata =
  to-language  'ABNFA'
  ; omitted ...
  action  (
    *repeat
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
  / 1*safe-vchar--STRING(factor)

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

safe-vchar = ALPHA / DIGIT / '-'

; omitted ...
```

为了包裹空格, 逗号等特殊符号的引号被剔除了.

事实上分直接动作(`to--`)和引用动作, 可用的形式有:

    to--action
    to--action( arguments... )
    refer--typename
    refer--typename( field, arguments... )
    refer--typename( '', arguments... )

引用动作当 `refer` 匹配成功后生成 `typename` 类型的字段 `field`.

可用的 `typename` 包括通用类型和 Metadata 中声明的类型.

所有缺省的 `field` 值为 `''`, 支持 field 不在当前节点上, 通过 field 的首字母:

1. ?  以 closest 方式向上赋值到具有指定字段的节点
1. /  赋值到根节点的指定字段

部分动作有引用动作和直接动作两种形式, 见下文.

### refer--ARRAY

生成通用 ARRAY 实例, 忽略所有子层的 `field`.

    refer--ARRAY
    refer--ARRAY(field)

### refer--BITS

专用于处理 abnfa 规则中二进制形式 `%b` 的 `1*64BIT` 字符串.

*未实现*

### refer--BYTES

生成通用 BYTES 实例, 直接保存匹配的二进制原始数据.

    refer--BYTES
    refer--BYTES(field)

*未实现*

### refer--OBJECT

生成键值为字符串的 Key-Value 对象, 参见 refer--PROPERTY.

    refer--OBJECT
    refer--OBJECT(field)

允许 Meta 定义 field 允许的 Value 类型.

### refer--MAP

生成键值任意类型的 Key-Value 对象, 参见 refer--PROPERTY.

    refer--MAP
    refer--MAP(field)

允许 Meta 定义 field 允许的 Value 类型.

### refer--PROPERTY

生成通用 OBJECT, MAP 实例的一个临时元素(项), 每个元素具有临时字段 `KEY`,`VALUE`.

每个 `KEY`,`VALUE` 都有明确的类型.

    refer--PROPERTY
    refer--PROPERTY(the-target-field-for-OBJECT)

第一种形式 `refer` 可产生多个 Key-Value, 参见 [JSON parser][].

第二种形式 `refer` 只产生一个 Key-Value, 参见 [ABNFA Definition of ABNFA][].

### refer--RUNE

用于 Unicode 码点数据, 检查码点合法性. 格式参见 `to-refer--INT`.

### refer--TIME

生成通用通用 TIME 实例.

    refer--TIME
    refer--TIME(field)

TIME 可拥有的字段:

1. year       数字年份
1. month      数字月份或月份单词(判断前三位, 不区分大小写)
1. day        数字日, 月份应有的日
1. hour       数字小时, 值范围 0 到 23
1. minute     数字分钟, 值范围 0 到 59
1. second     数字秒, 值范围 0 到 60, 60 只用于正确的闰秒时间
1. nanosecond 纳秒, 1 到 9 位数字, 不足 9 位的进行修正到纳秒
1. offset     UTC 偏移量, +hhmm 或 -hhmm
1. dst        夏令时标记, true 或 false
1. lsc        期望在时间计算中考量闰秒影响, true 或 false
1. since      年份补偿, year = year + since

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

当 `refer` 生成的类型有多种可能时使用.

    refer--pending
    refer--pending(field)

`pending` 和 `type` 总是成对儿的, 必须确定 `typename`.

### to-refer--STRING

设置通用 STRING 到字段, 支持解码.

    to--STRING(field, string-value)
    to--STRING(+field, string-value)
    to--STRING(field, 'string value')
    refer--STRING
    refer--STRING(+)
    refer--STRING(field)
    refer--STRING(+field, unescape)

其中

1.`+` 表示拼接字符串到字段
1.`unescape` 表示对对 `\` 开始的转义字符进行反转义

### to-refer--INT

解析通用 INT 类型家族数据到字段.

    to--INT(field, -1)
    refer--INT
    refer--INT(field, radix)
    refer--INT(field, LE)
    refer--INT(field, BE)
    refer--INT(field, ME)

其中

1. radix 值为 2,8,10,16 的基数(进制), 缺省为 10.
1. `LE`  用于二进制小尾序 Little-Endian
1. `BE`  用于二进制大尾序 Big-Endian
1. `ME`  用于二进制混合序 Middle-Endian

*目前本包仅支持 radix*

### to-refer--FLOAT

解析通用 FLOAT 类型家族数据到字段.

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

*目前本包仅支持 default*

### to--copy

拷贝一个常量字段的值到另一个字段.

    to--copy(field, dist-field)

### to--rename

更改当前节点内所有的字段为另一个字段名.

    to--rename('', another-field)
    to--rename(field, another-field)
    to--rename(field, '')

### to--turn

规则转移.

    to--turn(rulename, another-rulename)

转移后引用 `rulename` 规则时会转向引用 `another-rulename`.
当 `another-rulename` 等于 `rulename` 时表示回迁, 恢复正常的引用.

### to--fault

结束匹配并返回(抛出)错误信息, 后缀当前的行列位置, 总长度不超过 60 列.
如果当前位置是 `EOF` 则附加前缀 `[EOF]`.

    to--fault('message ...')
    to--fault('message ...', -10)
    to--fault('message %s ...')
    to--fault('message %q ...')
    to--fault('message %s ...', later)
    to--fault('message %q ...', later)

如果包含 `%s` 或 `%q`, 从 `later` 位置提取原始数据.

1. `%s`    提取原始非空白字符串
1. `%q`    用双引号包裹提取原始字符串并的转义空白字符
1. `later` 负数偏移字符量或已生成的字段名. 缺省值为 0, 即当前位置.

输出举例:

    Illegal configuration to-infix:10:4
    [EOF]Unclosed double quotes to-:100:4

### to--eol

依照 `to-crlf` 的配置匹配换行符并记录行列位置信息. 格式:

    to--eol

### to--indent

匹配行首缩进, 适用于缩进语法的语言. 格式

    to--indent        缩进大于父节点
    to--indent('>')   缩进大于父节点
    to--indent('>1')  缩进比父节点多 1
    to--indent('>=')  缩进不小于父节点, 大于等于
    to--indent('==')  缩进等于节点
    to--indent('<=')  缩进小于等于父节点
    to--indent('<1')  缩进比父节点少 1
    to--indent('<')   缩进小于父节点

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

## 核心算法

匹配过程中, 少数动作会被立即执行, 比如 `to--eol`, `to--discard`.
多数动作被记录下来(不直接执行), 比如 `refer--INT`, `refer--pending`, `to--type`.

```abnf
example = rule-a--pending(a) ',' rule-b--pending(b) rule-c--STRING(c)
rule-a  = 'A' to--type(A)
rule-b  = 'B' to--type(B)
rule-c  = 'C'
```

样本 `A,BC` 将生成下列(伪)动作序列 actions:

```
1, 1, 0, type(A)
0, 1, 0, pending(a)
3, 3, 2, type(B)
2, 3, 2, pending(b)
3, 4, 4, STRING(c)
```

三个数字依次表示:

1. source-start    数据开始的位置
1. source-end      数据结束的位置
1. starting-length 动作开始时 action.length

所以动作记录是: 从左到右, 从内向外
节点构建顺序是: 从底部确定类型, 从外到内, 从上向下构建字段

而 `to--discard` 会直接丢弃(移除,弹出)最后一个动作, 被移除的常见动作是 `pending`.

## License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234
[Core Rules]: https://tools.ietf.org/html/rfc5234#appendix-B.1
[tr44]: https://www.unicode.org/reports/tr44/#GC_Values_Table
[Base64]: https://tools.ietf.org/html/rfc4648#section-4
[Go time]: https://golang.google.cn/pkg/time/#pkg-constants
[转义字符]: https://en.wikipedia.org/wiki/Escape_character
[IEEE 754]: https://en.wikipedia.org/wiki/IEEE_754
[ABNFA Definition of ABNFA]: https://github.com/ZxxLang/abnfa/blob/master/grammar/abnfa.abnf
[JSON parser]: https://github.com/ZxxLang/abnfa/blob/master/grammar/json-parser.abnf
