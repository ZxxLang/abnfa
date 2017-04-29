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
  type: string    # AST 节点的类型名称
  key: string     # 该节点在父节点的属性名
  raw: string     # 用于叶子节点, 保留匹配的原始字符串.
  method: string  # 表示如何赋值到父节点, 分为三类
                  #   note 注释节点
                  #   push 表示 parentNode[key].push(thisNode)
                  #   其它 表示 parentNode[key] = thisNode
  factors:        # 用于数组或非叶子节点, 其元素为生成子节点的动作.
    - Action:     # 当节点具有多个属性时属于非叶子节点
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

本节详述可用的方法以及与 key, type 的可组合性.

所有方法中只有 lit, precedence 会保存匹配的原始字符串.

### lit

当需要保存匹配的原始字符串时使用. 参见 [千位分隔符数值](#Demos).

    ref-lit        support stitching
    ref-lit-key    support stitching
    ref-lit--type  does not support stitching

### to

可省略, 向目标属性直接赋值. 事实上 'to' 总是被替换为空字符串.

    ref-to-key-[type] ---> ref--key-[type]

### push

目标属性为数组.

    ref-push-[key]-[type]

### precedence

用于二元运算符. 该方法保存匹配的原始字符串.

    ref-precedence-key

ref 中的优先级由低到高排列, 使用纯字符串分组替代写法, 采用贪婪匹配. 示例:

```abnf
BinaryExpr      = (
                    operatorSymbol-precedence-operator /
                    operatorAlpha-precedence-operator 1*cwsp
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

### factors

该方法产生 factors.

    ref-factors-[key]-[type]

常用于数组, 参数列表等.

### alone

该方法产生 factors. 当 factors 内仅有一个动作时提升为当前动作.

    ref-alone-[key]-[type]

常用于分组表达式等.

### ahead

该方法产生 factors. 收纳先前动作到 factors, 并交换 key 和 type.

    ref-ahead-[key]-[type]

示例: 用于一元后缀表达式, 该例中 Identifier- 不需要 key

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-ahead-argument-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

注意: 对比 prefix 和 infix, ahead 不检查运算符和后续运算子.

### prefix

该方法产生 factors. 用于一元前缀表达式. 前后都必须生成运算子动作.

    ref-prefix-[key]-type

提示: 运算子必须具有 type

### infix

该方法产生 factors. 用于二元中缀表达式. 前后都必须生成运算子动作.
收纳先前动作到 factors, 并交换 key 和 type.

    ref-infix-[key]-type

### next

不生成动作, 仅对后续生成的首个动作设置 key.
可配合 ahead, prefix, infix 使用.

    ref-next-key

### note

该动作用于注释, 配合 ahead, prefix, infix 可排除非运算子.

    ref-note-[key]-[type]

注意: 为了正确计算运算子, 非运算子必须使用该方法.

# Actions

核心工具 Actions 依据规则匹配输入源生成 AAT.

了解下述生成步骤有助于正确使用 ABNFA 文法以及开发插件.

初始:

    rules, source 和可选的 plugins 开始解析匹配

匹配:

    自顶向下进行匹配, 自底向上生成动作
    插件被执行时可发出中断或创建插件事件, 但注意上级动作可能未生成.
    匹配过程可能直接生成子 factors, 比如 alone 方法
    每个 factors 都执行构建步骤.

构建:

    先触发插件事件, 通常无需要处理子 factors.
    生成 ahead  方法的子 factors
    生成 prefix 方法的子 factors
    生成 infix  方法的子 factors
    其它方法依据 start, end 生成子 factors

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

以 ref 表示插件名称写在文法中.

发出中断, 在插件执行成功且需要中断后续匹配时使用. 操作:

    插件设置 Actions 实例的属性 break = true 并返回 true 表示成功

生成事件, 通过调用 Actions 实例的 before 方法.

```js
function before(type, method, key){}
```

参数:

    type   字符串, 表示事件函数名称, 插件函数 'ON_type' 必须存在.
    method 字符串, 附加参数, 保存在 method 属性
    key    字符串, 附加参数, 保存在 method 属性

该函数返回布尔值 true 表示成功, false 表示失败.

如果无需添加触发事件, 执行阶段也要返回布尔值 true 表示成功, false 表示失败.

事件阶段:

由 Actions 内部机制在构建时首先触发

```js
function event(self, factors, index, node){}
```

参数:

    self     该 Actions 实例
    factors  需要处理的动作数组
    index    该事件在 factors 中的下标, factors[index] 已被设置为 null
    node     该事件节点值 factors[index]

返回:

    true  布尔值, 表示成功
    false 布尔值, 表示整个匹配彻底失败

下面列举内建插件

### ACTIONS

加载一个插件. 示例: 加载 'EOF', 'CRLF' 两个插件

```abnf
first = ACTIONS-CRLF ACTIONS-EOF real-grammar-rule
```

### FLAG

向前一个具有 type 的动作的 flag 属性赋值.

    FLAG-flag-[flag...] --> target.flag = flag

### EOF

匹配输入源结尾.

    EOF

提示:

    如果输入源必须全部被匹配时应该使用 EOF 插件.
    否则前部被匹配也会成功.

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

### OWN

要求自 factors[index] 之后的动作具有指定的属性名称.

    OWN-key-[key...]

### OUTDENT

支持缩进语法, 允许连续空行. 必须是 alone 或 factors 方法内的首个动作.

    ACTIONS-OUTDENT-SP  行首缩进符为空格(%x20)
    ACTIONS-OUTDENT-TAB 行首缩进符为水平制表符(%x09)
    ACTIONS-OUTDENT     等价 ACTIONS-OUTDENT-TAB

该插件依赖 CRLF 插件, 如果 CRLF 未被加载将自动加载 CRLF.

使用格式:

    OUTDENT-[allow]-[deny]

算法对比插件列开始位置(startCol)与后续行的列开始位置(col)的关系:

    col <  startCol 判定缩出, 结束 alone.
    col >  startCol 规则 deny  测试失败继续, 否则判定失败.
    col == startCol 规则 allow 测试成功继续, 否则判定缩出.

示例: 省略了一些规则的写法

```abnf
first       = ACTIONS-OUTDENT statement

statement   = IfStmt-alone- / Block-alone-

IfStmt      = "if" OUTDENT-else-else OWN-test-consequent
              "if" *cwsp "(" *cwsp Expression-alone-test *cwsp ")" *cwsp
              Block-alone-consequent- *cwsp
              [else statement-next-alternate]
else        = "else" 1*cwsp

Block       = OUTDENT-rightBracket "{" *cwsp statement *cwsp "}"

Expression  = ( NumericExpr- / UnaryExpr-prefix- / group-alone )
              [UpdateExpr-ahead-operand- / BinaryExpr-infix-left- ]

group        = OUTDENT-rightBracket "(" Expression ")"

rightBracket = "}" / "]" / ")"
```

### DENY

检查前一个动作的 raw 属性, 拒绝 ref 提供的字符串序列值.
如果拒绝会导致解析失败.
使用格式:

    DENY-ref

示例: 拒绝 Identifier 使用关键字

```abnf
first      = ACTIONS-DENY Identifier- DENY-keywords
Identifier = ALPHA *(ALPHA / DIGIT)
keywords   = "if" / "else" / "function"
ALPHA      = %x41-5A / %x61-7A
DIGIT      = %x30-39
```

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
Expression   = (NumericExpr- / UnaryExpr-prefix- / group-alone)
               [BinaryExpr-infix-left-]

group        = "(" Expression ")"

UnaryExpr    = minus-lit-operator Expression-next-operand
               Expression-next-right

NumericExpr  = 1*3DIGIT-lit *("," 3DIGIT-lit)
minus        = "-"
operator     = ("+" / "-") / ("*" / "/")
DIGIT        = %x30-39
```

样本 `-1-2*-3` 的输出:

```yaml
- start: 0
  end: 7
  type: BinaryExpr
  method: infix
  key: ''
  factors:
    - start: 0
      end: 2
      type: UnaryExpr
      method: prefix
      factors:
        - start: 0
          end: 1
          raw: '-'
          method: lit
          key: operator
        - start: 1
          end: 2
          raw: '1'
          method: lit
          type: NumericExpr
          key: operand
      key: left
    - start: 2
      end: 3
      raw: '-'
      method: precedence
      key: operator
      precedence: 1
    - start: 3
      end: 7
      type: BinaryExpr
      method: infix
      key: right
      factors:
        - start: 3
          end: 4
          raw: '2'
          method: lit
          type: NumericExpr
          key: left
        - start: 4
          end: 5
          raw: '*'
          method: precedence
          key: operator
          precedence: 2
        - start: 5
          end: 7
          type: UnaryExpr
          method: prefix
          key: right
          factors:
            - start: 5
              end: 6
              raw: '-'
              method: lit
              key: operator
            - start: 6
              end: 7
              raw: '3'
              method: lit
              type: NumericExpr
              key: operand
```

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234