# ABNFA

ABNFA 基于 [ABNF][] 对引用规则扩展动作语义, 为生成 AST 提供工具链.

原定义:

```abnf
rule      =  rulename defined-as elements c-nl
rulename  =  ALPHA *(ALPHA / DIGIT / "-")
```

ABNFA 的定义:

```abnf
rule      = action definedas elements cnl
rulename  = ALPHA *(ALPHA / DIGIT)
argument  = 1*(ALPHA / DIGIT)

action    = ref [tail]
tail      = "-" [method] ["-" key] ["-" type]
            *(ALPHA / DIGIT / "-")

ref       = rulename
type      = argument
method    = argument
key       = 1*(ALPHA / DIGIT / "_")
```

即 action 的结构为:

```yaml
action:
  ref: String
  tail: String
  method: String
  key: String
  type: String
```

该结构包含如何生成 AST 节点对象的信息, 所以该扩展命名为 Actions.

# Specifications

1. 大小写敏感
2. 符号 "-" 被用做分隔符
3. 从首个规则开始匹配输入源
4. 文法描述顺序为自顶向下, 从左向右
5. 规则 `rule = "" other` 中的 `""` 总是被匹配失败
6. tail 存储 action.ref 之后的字符串
7. 含 method 或 key 或 type 的动作产生动作对象

完整结构为:

    ref-method-key-type-more

表示的语义:

    ref 生成 type 对象, 以 method 方式赋给上级对象的 key 属性. more 为额外参数.

等价简写格式: 以 '-' 结尾, 表示 type 和 ref 同名.

    ref-                   === ref---ref
    ref-method-            === ref-method--ref
    ref-method-key-        === ref-method-key-ref
    ref-method-key-more-   === ref-method-key-ref-more

最终匹配输入源后产生动作数组, 该数组称作 Abstract Actions Tree (AAT).

AAT 元素为动作对象, 包含生成 AST 节点的信息.
在下文中单词 `动作` 表示动作数组的元素, `节点` 表示 AST 节点.

动作对象结构:

```yaml
Action:
  start: 0        # 该动作匹配输入的开始偏移量.
  end: 1          # 该动作匹配输入的结束偏移量(不包含 end)
  type: string    # ref 生成的 AST 节点类型名称
  key: string     # 该节点在父节点的属性名
  raw: string     # 用于叶子节点, 保留匹配的原始字符串.
  method: string  # 表示如何赋值到父节点, 分为三类
                  #   note 注释节点
                  #   push 表示 parentNode[key].push(thisNode)
                  #   其它 表示 parentNode[key] = thisNode
  factors:        # 非叶子节点, 包含该节点的子节点(动作)
    - Action:     #
  precedence: 1   # 用于二元运算表达式表示运算优先级
  flag: string    # 生成该节点的额外标记, 参见 [FLAG](#FLAG)
  loc:            # 行列位置信息, 参见 [CRLF](#CRLF)
    startLine: 1
    startCol: 1
    endLine: 2
    endCol: 1
```

该结构非常接近 AST, 只是属性在 factors 里面.

## methods

方法用来描述如何生成动作, 以及动作间的关系.

本节详述可用的方法以及与 key, type 的可组合性.

所有方法中 lit, leaf, note, precedence 具有提取匹配的原始字符串能力.
被提取的字符串仅保存在叶子节点的 raw 属性中.

### lit

该方法提取匹配的原始字符串. 支持空字符串.

    ref-lit        支持拼接
    ref-lit-key    支持多 key 属性, 且拼接相同的 key
    ref-lit--type  不支持拼接, 等价 ref-leaf--type

拼接时必须避免回退, 千位分隔小数位 `.123'456'78` 为例:


```abnf
; incorrect = "." *(d3-lit "'") d12-lit
; 因 d3 拼接时会改变已有动作
decimals   = "." (
              d4-lit /
              d3-lit *("'" d3-lit) ["'" d12-lit] /
              d12-lit
            )
d12        = 1*2DIGIT
d3         = 3DIGIT
d4         = 4*DIGIT
```

参见 [千位分隔符数值](#Demos).

### leaf

该方法提取匹配的原始字符串, 并生成动作. 支持空字符串.

    ref-leaf-[key]-[type]

在 ref 内不生成动作.

### note

该方法专用于注释, 行为与 leaf 一致.

    ref-note-[key]-[type]

为了正确计算运算子, 必须使用该方法配合 prefix 和 infix 排除非运算子.

### to

该方法不生成动作, 重置 ref 首个动作的 key.

事实上工具链总是把 'to' 替换为空字符串

    ref--key
    ref-to-key

### reset

该方法不生成动作, 重置 ref 首个动作的 key 和开始偏移量.

    ref-reset
    ref-reset-key  重置 key

参见示例中的 [if-reset](#OUTDENT)

### amend

当 ref 产生动作时和前一个动作交换位置和 key, 否则修改前一个动作的 key 或 type

    ref-amend--type     只更改 type
    ref-amend-key-type  只交换 key

参见示例中的 [Call-amend-func-](#OUTDENT)

示例: 用于一元后缀表达式

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-amend-operand-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

### prefix

用于一元前缀表达式. 之前和内部必须生成运算子动作.

    ref-prefix-[key]-type

提示: 运算子必须具有 type

### infix

用于二元中缀表达式. 收纳先前动作到 factors, 并交换 key.

    ref-infix-[key]-type

该方法内部必须含有 binary 动作.

### binary

用于二元中缀运算符. 该方法保存匹配的原始字符串.

    ref-binary-key

运算符以优先级由低到高排列, 使用纯字符串分组替代写法, 采用贪婪匹配. 示例:

```abnf
BinaryExpr      = (
                    operatorSymbol-binary-operator /
                    operatorAlpha-binary-operator 1*cwsp
                  ) *cwsp Expression

operatorSymbol  = "" /
                  "" /
                  ("+" / "-") /
                  ("*" / "/")

operatorAlpha   = "or" /
                  "and" /
                  "" /
                  ""
```

该例中运算符规则被分成两组, 实现字符串运算符右侧界限检查.

注意: precedence 最小值是从 1 开始的.

### body

该方法先产生 factors, 匹配成功后进行构建, 可包含 0 或多个子节点(动作).

    ref-body-[key]-[type]

参见 [缩出插件](#OUTDENT).

注意: 构建依据层级关系对父节点生成 factors 并收纳子节点, 但非递归.

所以多层级时必须使用 body 才能获得正确的结果.

### list

与 body 方法行为一样, 并且表示 ref 生成数组元素(key 是数组).

    ref-list-[key]-[type]

参见 [缩出插件](#OUTDENT).

### alone

该方法先产生 factors, 匹配成功后进行构建, 产生唯一节点(动作)作为当前节点(动作).

    ref-alone-[key]-[type]

常用于分组表达式等.

参见 [缩出插件](#OUTDENT).


### ifn

该方法测试 ref 通过时返回 false, 不通过返回 true.

    ref-ifn

# Actions

核心工具 Actions 依据规则匹配输入源生成 AAT.

Actions 实例有几个重要属性:

1. src      保存待匹配的字符串
2. pos      当前待匹配位置
3. end      结束位置, 默认为 src.length
4. frozen   冻结位置, MUST 插件可设置此位置
5. factors  动作数组, 元素为匹配生成的 Action
6. events   事件数组, 元素为设置多了 index 属性的 Action

了解下述处理步骤有助于正确使用 ABNFA 文法以及开发插件.

匹配:

    自顶向下进行匹配, 自底向上生成动作
    插件被执行时产生的事件保存在数组属性 events 中
    alone, body, list 方法触发构建
    ref-amend-key-type   方法触发构建
    匹配完成触发构建

构建:

    先执行事件, 可直接处理每个动作, 或者置 null 表示删除
    设置两列信息, 如果需要的话
    构建 prefix 方法的子动作树
    构建 infix  方法的子动作树
    依据 start, end 确定从属关系构建子动作树

## plugins

插件函数可通过 new Actions 的第二参数或使用 addPlugins 方法传递.

加载阶段:

必须位于第一条规则前部(事实上 ACTIONS 是内置插件).

    ACTIONS-PluginName-[args]-[args]-[args]

如果存在自加载函数 `LOAD_PluginName` 则执行, 否则执行 `PluginName`.

```js
function LoadOrExecutePlugin(n, self): bool {}
```

参数:

    n    对象, 含引用规则名的字符串属性 ref 和其它部分的对象属性 action.
    self 当前的 Actions 实例

返回:

    true  布尔值, 表示成功
    false 布尔值, 表示失败

执行阶段:

以 ref 表示插件名称写在文法中. 通过调用 Actions 实例的 before 方法生成事件.

```js
function before(type, method, key){}
```

参数:

    type   字符串, 表示事件函数名称, 插件函数 'ON_type' 必须存在.
    method 字符串, 附加参数, 保存在 method 属性
    key    字符串, 附加参数, 保存在 method 属性

返回事件对象, 该对象比动作对象多一个表示当前 factors.length 的 index 属性

如果无需添加触发事件, 执行阶段也要返回布尔值 true 表示成功, false 表示失败.

事件阶段:

由 Actions 内部机制在构建时首先触发

```js
function trigger(self, factors, event){}
```

参数:

    self     该 Actions 实例
    factors  需要处理的动作数组
    event    由 before 生成的事件

返回:

    true  布尔值, 表示成功
    false 布尔值, 表示整个匹配彻底失败

下面列举内建插件

### ACTIONS

加载一个插件. 示例: 加载 CRLF', 'FLAG' 两个插件

```abnf
first = ACTIONS-CRLF ACTIONS-FLAG real-grammar-rule
```

### FLAG

向当前 factors 中最后一个动作 last = factors[factors.length-1] 的 flag 属性赋值.

    FLAG-flags  --> last.flag = (last.flag || '') + '-' + flags

### CRLF

在动作中记录行列位置. 该插件总是被首先执行.

    CRLF

行列位置都从 1 开始, 保存在动作属性 loc 中:

```yaml
Action:
  loc:
    startLine: 1
    startCol: 1
    endLine: 1
    endCol: 2
```

### MUST

后续匹配必须成功, 拒绝回滚.

    MUST

### POP

该插件产生事件, 实现 factors.pop() 的效果

    POP

在事件中执行如下代码:

```js
function ON_POP(self, list, n) {
  // list == self.factors
  if (n.index && n.index <= list.length)
    list[n.index - 1] = null
  return true
}
```

### OUTDENT

支持缩进语法, 缩进量必须一致, 允许连续空行. 自动加载 CRLF.

加载:

    ACTIONS-OUTDENT      行首缩进为 1 个水平制表符(%x09)
    ACTIONS-OUTDENT-SP-n 行首缩进为 n 个空格(%x20), n <= 8, 缺省为 1
    ACTIONS-OUTDENT-SP   行首缩进为 n 个空格(%x20), 自动计算, n <= 8

该插件产生事件, 必须位于 factors[0], alone 或 factors 方法可创建新的 factors.

    OUTDENT         自动计算 aligned
    OUTDENT-aligned 允许后续行与首行对齐
    OUTDENT-        === OUTDENT-aligned
    OUTDENT-0       === OUTDENT- 且无缩进时判定缩出

算法:

执行 OUTDENT 后会计算当前行的缩进量 firstIndent, 在后续 CRLF 动作中进行缩出判定:

    记下当前位置 failure
    匹配 1*CRLF, 失败返回 false.
    记下当前位置 successful
    计算缩进量 indent 并按公式判定缩出:
      indent < firstIndent || !aligned && indent == firstIndent
    是缩出, 设置偏移量 failure, 返回 false
    非缩出, 设置偏移量 successful + indent, 返回 true.

以简化的 Python if-else 为例:

```abnf
first      = ACTIONS-OUTDENT ACTIONS-DENY ACTIONS-FLAG topStmts
topStmts   = *CRLF statement *(CRLF statement) *CRLF
stmts      = OUTDENT CRLF statement *(CRLF statement)
statement  = if-reset / expression

if         = "if" 1*SP ifCell-body--if
ifCell     = OUTDENT- expression--test ":" *SP
             (expression--body / stmts-body-body) FLAG
             [CRLF (else-reset / elif-reset)]
elif       = "elif" 1*SP ifCell-body-orelse-if FLAG
else       = "else:" *SP (expression--orelse / stmts-body-orelse) FLAG

ident      = Ident-lit- DENY-keywords [Call-amend-func-]
keywords   = "class"/ "if" / "else" / "elif"
Ident      = ALPHA *(ALPHA / DIGIT)
Num        = 1*DIGIT

expression = (ident / Num-lit- / Set-body- / List-body- / Dict-body- / group-alone) *WSP
elements   = OUTDENT- [CRLF] expression *("," *WSP [CRLF] expression ) [CRLF]
group      = "(" OUTDENT- [CRLF] expression [CRLF] ")"

List       = "[" [elements-body-elts FLAG] "]"
Set        = "{" [elements-body-elts FLAG] "}"

Dict       = "{" [pairs] "}"
pair       = expression-alone-keys FLAG ":" *WSP expression-alone-values FLAG
pairs      = OUTDENT- [CRLF] pair *("," *WSP [CRLF] pair) [CRLF]

Call       = args-body-args FLAG
args       = "()" / "(" [elements] ")"

WSP    = SP / HTAB
CWSP   = WSP / CRLF
HTAB   = %x09
SP     = %x20
ALPHA  = %x41-5A / %x61-7A
DIGIT  = %x30-39
```

### RAW

检查前一个动作的 raw 属性值是否满足条件.

    RAW-IS-tail   ---> prev.raw == tail
    RAW-UN-tail   ---> prev.raw != tail

注意这里的 `tail` 是 'IS-' 或者 'UN-' 之后的所有字符串.

示例: ±Infinity, ±NaN

```abnf
first       = ACTIONS-RAW Float

Float       = float-leaf-Float / InfNaN---Float
float       = [sign] 1*DIGIT "." 1*DIGIT
InfNaN      = [sign-lit] 1*ALPHA-lit (
                RAW-IS-NaN / RAW-IS--Infinity /
                RAW-IS--NaN / RAW-IS-Infinity
              )

sign        = "-"
ALPHA       = %x41-5A / %x61-7A
DIGIT       = %x30-39
```

### DENY

拒绝前一个动作的 raw 属性值等于 rulename 提供的可选字符串.
拒绝会终止匹配.

    DENY-rulename-[rulename]-[rulename]

示例: 拒绝 Identifier 使用关键字

```abnf
first      = ACTIONS-DENY Identifier- DENY-keywords-literal
Identifier = ALPHA *(ALPHA / DIGIT)
keywords   = "if" / "else" / "function"
literal    = "true" / "false" / "null"
ALPHA      = %x41-5A / %x61-7A
DIGIT      = %x30-39
```

### NON

期望前一个动作的 raw 属性值不等于 rulename 提供的可选字符串.

该插件与 DENY 的区别:

  1. 允许 raw 为 null
  2. 不终止匹配

### SWAP

互换之前两个 action 的 key 和 flag

    SWAP

# Demos

本节展示首个规则名表示目标对象, 向目标设置成员(属性或元素)的情况.

样本 `0234 678` 是以空格分隔的两个数值, 期望结果为数值数组.

```abnf
Array     = 1*(Number- [SP])
Number    = 1*DIGIT-lit
DIGIT     = %x30-39
SP        = %x20
```

样本 `0,234 678` 增加了千位分隔符.

```abnf
Array  = 1*(Number- [SP])
Number = 1*3DIGIT-lit *("," 3DIGIT-lit)
DIGIT  = %x30-39
SP     = %x20
```

样本 `-0,234 678` 增加了负号符号位, Number 非结构体.

```abnf
Array  = 1*(Number- [SP])
Number = [sign-lit] 1*3DIGIT-lit *("," 3DIGIT-lit)
sign   = "-"
DIGIT  = %x30-39
SP     = %x20
```

输出:

```yaml
- start: 0
  end: 6
  raw: '-0234'
  method: lit
  type: Number
- start: 7
  end: 10
  raw: '678'
  method: lit
  type: Number
```

样本 `+-0,234 678` 增加了符号位运算, Number 是结构体.

```abnf
Array  = 1*(Number- [SP])
Number = *sign-lit-sign 1*3DIGIT-lit-raw *("," 3DIGIT-lit-raw)
sign   = "-" / "+"
DIGIT  = %x30-39
SP     = %x20
```

输出:

```yaml
- start: 0
  end: 7
  type: Number
  factors:
    - start: 0
      end: 2
      raw: +-
      method: lit
      key: sign
    - start: 2
      end: 7
      raw: '0234'
      method: lit
      key: raw
- start: 8
  end: 11
  type: Number
  factors:
    - start: 8
      end: 11
      raw: '678'
      method: lit
      key: raw
```

# Examples

四则运算表达式: 支持千位分隔符数值

```abnf
Expression   = (Num- /
                Unary-prefix- /
                group-alone)
               [Binary-infix-left-]

group        = "(" Expression ")"
Unary        = minus-lit-op Expression--elt
Binary       = operator-binary-op Expression--right

Num          = 1*3DIGIT-lit *("," 3DIGIT-lit)
minus        = "-"
operator     = ("+" / "-") / ("*" / "/")
DIGIT        = %x30-39
```

样本 `-1-2*-3` 的输出:

```yaml
- start: 0
  end: 7
  type: Binary
  method: infix
  key: ''
  precedence: 1
  factors:
    - start: 0
      end: 2
      type: Unary
      method: prefix
      factors:
        - start: 0
          end: 1
          raw: '-'
          method: lit
          key: op
        - start: 1
          end: 2
          raw: '1'
          method: lit
          type: Num
          key: elt
      key: left
    - start: 2
      end: 3
      raw: '-'
      method: operator
      key: op
      precedence: 1
    - start: 3
      end: 7
      type: Binary
      method: infix
      key: right
      precedence: 2
      factors:
        - start: 3
          end: 4
          raw: '2'
          method: lit
          type: Num
          key: left
        - start: 4
          end: 5
          raw: '*'
          method: operator
          key: op
          precedence: 2
        - start: 5
          end: 7
          type: Unary
          method: prefix
          key: right
          factors:
            - start: 5
              end: 6
              raw: '-'
              method: lit
              key: op
            - start: 6
              end: 7
              raw: '3'
              method: lit
              type: Num
              key: elt
```

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234