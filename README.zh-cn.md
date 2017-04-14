# ABNFA

ABNFA 基于 [ABNF][] 对引用规则扩展动作语义, 为生成 AST 提供工具链.

原定义:

```abnf
rule      =  rulename defined-as elements c-nl
rulename  =  ALPHA *(ALPHA / DIGIT / "-")
```

ABNFA 部分动作语义定义:

```abnf
rule      = action defined-as elements c-nl

action    = ref  ["-" [method] ["-" [key] ["-" [type] ["-" [extra] ]]]]

name      = ALPHA *(ALPHA / DIGIT)
ref       = name
method    = name
key       = name
type      = name
extra     = ALPHA *(*"-" (ALPHA / DIGIT))
```

因该扩展描述了生成 AST 节点对象的动作信息, 被命名为 Actions.

# Specifications

完整的规则引用格式为五段式:

    ref-method-key-type-extra

等价简写格式: 以 '-' 结尾, 表示 type 和 ref 同名.

    ref-                   === ref---ref
    ref-method-            === ref-method--ref
    ref-method-key-        === ref-method-key-ref
    ref-method-key-extra-  === ref-method-key-ref-extra

约定:

1. 规则名大小写敏感
2. 符号 "-" 被 Action 专用
3. 匹配输入源时从首个规则名开始
4. 引用规则含有 Action 且被匹配的输入源才会被保留
5. 文法描述顺序为自顶向下, 从左向右.
6. 规则 'rule = "" other' 中的空字符串总是不被匹配

核心工具依据文法规则解析输入字符串产生动作数组, 其元素和结构类型为:

```yaml
Action:
  start: Int
  end: Int
  raw: String
  factors: [Action]
  precedence: Int
  type: String
  method: String
  key: String
  extra: [String]
```

该数组称作 Abstract Actions Tree: AAT. AAT 包含生成 AST 节点的信息:

    start      是该动作匹配输入的开始偏移量.
    end        是该动作匹配输入的结束偏移量(不包含 end).
    raw        匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    factors    表示同级别分组, 与 raw 互斥. 参见 alone 方法以及运算符.
    precedence 运算符优先级, 从 1 开始, 值越大优先级越高.
    其它源自 action 的属性, 其中 extra 为数组, 依据节点关系 method 值会被更新.

事实上 AAT 的结构非常接近 AST, 只是未生成 type 表示的具体节点.

## ref

引用规则名或插件名称.

当只有 ref 时不产生动作, 否则依据 type, method, key 产生动作.

## type

通常表示 AST 节点的类型名称. 在某些方法中该值可定制.

独立格式:

    ref- 表示该对象向上返回

## key

赋值目标属性名称, 有些方法中, 省略该值表示 parent 是个数组.

## extra

额外的参数.

比如当 method 被动作关系占用时可利用 extra 来指示 AST 节点关系.

## method

动作方法名, 约定的方法名用来指示动作间的关系用于生成 AAT,
如果不需要指示动作关系时可自定义名称用来指示 AST 节点关系.

简便起见, 下文按照自顶向下顺序对生成的动作进行如下命名:

    source 动作对象, 通常由 ref 生成.
    target 动作对象, 通常由上级规则生成.
    node   AST 节点对象, source 对应的 AST 节点.
    parent AST 节点对象, target 对应的 AST 节点.

下面列举约定的方法名和隐含的动作及节点关系, 当然可以通过 extra 更改节点关系.

### lit

当需要保存 ref 匹配的字符串时使用, 不能与 extra 组合使用.

    ref-lit--[type]     ---> target.raw  = source
    ref-lit-key-[type]  ---> parent[key] = node

行为:

    未使用 lit 的动作匹配的字符串被丢弃
    组合 type 的 lit 动作不合并
    未组合 type 且其它项相同的 lit 动作被合并

### precedence

当 ref 为二元运算符时使用. 运算符不能与 type 组合使用.

    ref-precedence-key ---> parent[key] = node

ref 中使用纯字符串分组替代写法, 优先级由低到高排列, 启用贪婪匹配. 示例:

```abnf
BinaryExpr      = (
                    operatorSymbol-precedence-operator /
                    operatorAlpha-precedence-operator 1*cwsp
                  ) *cwsp Expression

operatorSymbol  = ("") /
                  ("") /
                  ("+" / "-") /
                  ("*" / "/")

operatorAlpha   = ("or") /
                  ("and") /
                  ("") /
                  ("")
```

该例中运算符规则被分成两组, 实现字符串运算符右侧界限检查.

注意: precedence 最小值是从 1 开始的.

### alone

当 ref 生成独立的 source 时使用, source 的归属由上层确定.

    ref-alone ---> source.factors = []

常用于分组表达式, 被括号包裹的, 被逗号分隔的, 表达式运算子等.

### ahead

当 ref 生成 target, 先前生成的首个非 mark 动作为 source 时使用.

该方法必须与 type 组合使用.

    ref-ahead-key- ---> target.key, source.key = source.key, target.key

ahead 可用于一元后缀表达式. 示例: 该例中 Identifier- 不需要 key

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-ahead-argument-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

### prefix

当 ref 为一元前缀表达式, 后续生成的首个非 mark 动作为运算子时使用.

    ref-prefix-     ---> parent.push(node)
    ref-prefix-key- ---> parent[key] = node

### infix

当 ref 为二元中缀表达式, 后续生成的首个非 mark 动作为运算子时使用.

    ref-infix-     ---> parent.push(node)
    ref-infix-key- ---> parent[key] = node

### inner

当需要提取 ref 首个非 mark 动作时使用. 可配合 ahead, prefix, infix.

    ref-inner-key ---> parent[key] = node

### mark

该动作总是被保留, 配合 ahead, prefix, infix 用于排除非运算子.

    ref-mark-[key]-[type]-[extra]

典型的应用场景:

 - 注释
 - 版式相关
 - 给 AST 节点设置附加属性
 - 插件事件, 参见 Actions.

### customize

除了上述和生成动作密切相关的保留方法外, 使用者可自定义方法名.

下面推荐几个用来表示节点关系方法名.

#### to

通用赋值.

    ref-to-key- ---> parent[key] = node

#### fetch

该方法必须与 type 组合使用.

    ref-fetch-key- ---> parent[node[key]] = node

# Actions

Actions 依据 Rules 生成的规则和输入源生成 AAT.

了解下述 AAT 生成步骤有助于正确使用 ABNFA 文法以及开发插件.

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
function before(key, extra){}
```

参数:

    key   字符串, 表示事件函数名称, 对应的 'ON_key' 插事件函数必须存在.
    extra 数组, 事件节点的 extra 属性值

该函数返回布尔值 true 表示成功, false 表示失败.

如果无需添加触发事件, 执行阶段也要返回布尔值 true 表示成功, false 表示失败.

事件阶段:

由 Actions 内部机制在构建时首先触发

```js
function event(self, factors, index, node){}
```

参数:

1. self     该 Actions 实例
1. factors  需要处理的动作数组
3. index    该事件在 factors 中的下标, factors[index] 已被设置为 null
4. node     该事件节点值 factors[index]

返回:

    true  布尔值, 表示成功
    false 布尔值, 表示整个匹配彻底失败

下面列举内建插件

### ACTIONS

加载一个插件. 示例: 加载 'EOF', 'CRLF' 两个插件

```abnf
first = ACTIONS-CRLF ACTIONS-EOF real-grammar-rule
```

### EOF

匹配输入源结尾.

    ACTIONS-EOF

提示:

    如果输入源必须全部被匹配时应该使用 EOF 插件.
    否则前部被匹配也会成功.

### CRLF

在动作中记录行列位置. 该插件总是被首先执行.

    ACTIONS-CRLF

行列位置都从 1 开始, 保存在动作属性 loc 中:

```yaml
loc:
  startLine: Int
  startCol: Int
  endLine: Int
  endCol: Int
```

### OUTDENT

在代码块中进行缩进语法检查. 必须是 alone 方法内的首个动作.

    ACTIONS-OUTDENT-SP  行首缩进符为空格(%x20)
    ACTIONS-OUTDENT-TAB 行首缩进符为水平制表符(%x09)
    ACTIONS-OUTDENT     等价 ACTIONS-OUTDENT-TAB

该插件依赖 CRLF 插件, 如果 CRLF 未被加载将自动加载 CRLF.

使用格式:

    OUTDENT-[allow]-[deny]-[NotBreak]

算法对比插件列开始位置(startCol)与后续行的列开始位置(col)的关系:

    col <  startCol 判定缩出, 结束 alone.
    col >  startCol 规则 deny  测试失败继续, 否则判定失败.
    col == startCol 规则 allow 测试成功继续, 否则依据 !NotBreak 判定缩出.

其中 NotBreak 是任意的字符串,

示例: 省略了一些规则的写法

```abnf
first       = ACTIONS-OUTDENT statement

statement   = IfStmt-alone- / Block-alone-

IfStmt      = OUTDENT-else-else
              "if" *cwsp "(" *cwsp expression-inner-test *cwsp ")" *cwsp
              Block-alone-consequent- *cwsp
              [else statement-inner-alternate]
else        = "else" 1*cwsp

Block       = OUTDENT-rightBracket--continue "{" *cwsp statement *cwsp "}"

expression  = Expression-alone
Expression  = ( NumericExpr- / UnaryExpr-prefix- / group-alone )
              [UpdateExpr-ahead-operand- / BinaryExpr-infix-left- ]

group        = OUTDENT-rightBracket--continue "(" Expression ")"

rightBracket = "}" / "]" / ")"
```

提示: allow, deny 只是测试, 匹配会继续进行, 所以多种右括号可以写在测试中.

# Demos

本节展示首个规则名表示目标对象, 向目标设置成员(属性或元素)的情况.

样本 `0234 678` 是以空格分隔的两个数值, 期望结果为数值数组, ABNFA 定义:

```abnf
Array     = 1*(Number- [SP])
Number    = 1*DIGIT-lit
DIGIT     = %x30-39
SP        = %x20
```

样本 `0,234 678` 增加了千位分隔符, ABNFA 定义:

```abnf
Array  = 1*(Number- [SP])
Number = 1*3DIGIT-lit *("," 3DIGIT-lit)
DIGIT  = %x30-39
SP     = %x20
```

样本 `-0,234 678` 增加了负号符号位, ABNFA 定义: Number 非结构体.

```abnf
Array  = 1*(Number- [SP])
Number = [sign-lit] 1*3DIGIT-lit *("," 3DIGIT-lit)
sign   = "-"
DIGIT  = %x30-39
SP     = %x20
```

样本 `-+0,234 678` 增加了符号位运算, ABNFA 定义: Number 是结构体.

```abnf
Array  = 1*(Number- [SP])
Number = *sign-lit-sign 1*3DIGIT-lit-raw *("," 3DIGIT-lit-raw)
sign   = "-" / "+"
DIGIT  = %x30-39
SP     = %x20
```

# Examples

以四则运算表达式为例, 使用 Web IDL 描述该表达式的传统 AST 结构:

```webidl
enum UnaryOperator { "-" };

enum BinaryOperator { "+", "-", "*", "/" };

interface Expression : Node { };

interface UnaryExpr : Expression {
  attribute UnaryOperator operator;
  attribute Expression operand;
};

interface BinaryExpr : Expression {
  attribute BinaryOperator operator;
  attribute Expression left;
  attribute Expression right;
};

interface LiteralNumericExpression : Expression {
  attribute integer value;
};
```

ABNFA 定义

```abnf
Expression   = ( group-alone /
               UnaryExpr-prefix- /
               NumericExpr- )
               [BinaryExpr-infix-left-]

group        = "(" Expression ")"
UnaryExpr    = minus-lit-operator Expression-inner-operand
BinaryExpr   = operator-precedence-operator Expression-inner-right
NumericExpr  = 1*3DIGIT-lit *("," 3DIGIT-lit)
minus        = "-"
operator     = ("+" / "-") / ("*" / "/")
DIGIT        = %x30-39
```

注意: alone 在该例子中表达的是括号分组.

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234