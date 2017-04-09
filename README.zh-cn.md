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
  extra: String
```

该数组称作 Abstract Actions Tree: AAT. AAT 包含生成 AST 节点的信息:

    start      是该动作匹配输入的开始偏移量.
    end        是该动作匹配输入的结束偏移量(不包含 end).
    raw        匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    factors    表示同级别分组, 与 raw 互斥. 参见 alone 方法以及运算符.
    precedence 运算符优先级, 从 1 开始, 值越大优先级越高.
    其它源自 action 的属性, 依据节点关系 method 值会被更新.

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

额外的参数. 比如描述 node 和 parent 的关系.

## method

动作方法名, 指示动作间的关系用于生成 AAT.

简便起见, 下文按照自顶向下顺序对生成的动作进行如下命名:

    source 动作对象, 通常由 ref 生成.
    target 动作对象, 通常由上级规则生成.
    node   节点对象, source 对应的 AST 节点.
    parent 节点对象, target 对应的 AST 节点.

核心工具不生成和操作 node 和 parent, 下面的描述只表示常规做法.

注意: method 不是被用来指导生成 AST 的, 但并不可靠.

### lit

当 ref 内没有动作, source 为字符串时使用该方法.

    ref-lit     ---> target.raw  = source
    ref-lit-key ---> parent[key] = node

注意: 如果 ref 为运算符不能与 type 组合使用.

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

### to

该方法必须与 type 组合使用.

    ref-to-     ---> parent.push(node)
    ref-to-key- ---> parent[key] = node

### ahead

当 ref 生成 target, 先前生成的 source 动作是 target 的属性时使用.

该方法必须与 type 组合使用.

    ref-ahead-key- ---> target.key, source.key = source.key, target.key

ahead 可用于一元后缀表达式. 示例: 该例中 Identifier- 不需要 key

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-ahead-argument-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

### prefix

当 ref 为一元前缀表达式时使用.

    ref-prefix-     ---> parent.push(node)
    ref-prefix-key- ---> parent[key] = node

### infix

当 ref 为二元中缀表达式时使用. 必须与 type 组合使用.

    ref-infix-     ---> parent.push(node)
    ref-infix-key- ---> parent[key] = node

### alone

当 ref 生成独立的 source 时使用, source 的归属由上层确定.

    ref-alone ---> source.factors = []

常用于分组表达式, 被括号包裹的, 被逗号分隔的, 表达式运算子等.

### inner

当 ref 生成的第一个非 mark 的 type 动作为 source 时使用.

    ref-inner-key ---> parent[key] = node

### fetch

该方法必须与 type 组合使用.

    ref-fetch-key- ---> parent[node[key]] = node

该动作总是被保留, 并且:

 - 不参与表达式中的运算数数量计算

### mark

当以上方法都不合适时 mark 是最后的选择, 而不是自定义其它方法名.

    ref-mark-[key]-[type]-[extra]

该动作总是被保留, 并且:

 - 不参与表达式中的运算数数量计算

典型的应用场景:

 - 注释
 - 版式相关
 - 给 AST 节点设置附加属性

# Actions

Actions 依据 Rules 生成的规则和输入源生成 AAT.

了解 Actions 的算法有助于正确使用 ABNFA 文法以及开发插件.

准备:

    rules, source 和可选的 plugins 开始解析匹配

匹配:

    该过程是自顶向下的, 按文法顺序生成 Action 数组
    匹配过程可能直接生成子 factors, 比如 alone 方法
    每个 factors 都形成一个构建阶段
    插件是以 ref 的形式在此阶段被触发, 插件可以生成动作事件节点

构建:

    生成 ahead  方法的子 factors
    生成 prefix 方法的子 factors
    生成 infix  方法的子 factors
    其它方法依据 start, end 生成子 factors

事件:

    before 在构建前触发事件, 无需处理子 factors
    after  在构建后触发事件, 需要处理子 factors, 但无需递归

## plugins

当插件函数 InstanceOfActions.plugins[ref] 存在时会被调用. 函数原型:

```js
function plugin(n, thisArg): bool {}
```

参数:

    n       对象, 含引用规则名的字符串属性 ref 和其它部分的对象属性 action.
    thisArg 当前的 Actions 实例

返回:

    true  表示该阶段成功
    false 表示该阶段失败

插件有三个步骤:

加载: 必须写在文法的第一条规则前部.

    ACTIONS-PluginName-[args]-[args]-[args]

如果存在命名为 `LOAD_PluginName` 的插件函数, 则优先调用它.

插件函数需要返回布尔值表示是否加载成功.

触发: 在阶段性匹配输入源过程中被触发, 可产生下述结构的动作事件 event:

```yaml
type: 'ACTIONS'
method: 'mark'
key: String
extra: String
```

即: 触发的主要任务之一就是生成合适的动作事件

事件: 由 Actions 内部机制处理动作数组时调用

```js
this.plugins['ON_' + event.key](list, this, index)
```

其中 event === list[index], 这是在触发步骤中生成的.

参数:

1. list  需要处理的动作数组
2. this  该 Actions 实例
3. index 该动作标签在 list 中的下标

返回布尔值 true 表示成功, false 表示失败.

示例: 在 list 中强制使用空格作为缩进符号, 无论加载时使用了那个符号.

下面列举内建插件

### ACTIONS

这是所有其它插件的入口, 它有两个功能: 加载插件, 中断匹配

加载插件: 加载 'EOF', 'CRLF' 两个插件

```abnf
first      = loadplugin real-grammar-rule
loadplugin = ACTIONS-EOF ACTIONS-CRLF
```

中断匹配: 中断当前正在进行的动作列表

    ACTIONS-TRUE  对动作列表进行后期处理, 返回 true
    ACTIONS-FALSE 返回 false

### EOF

当允许匹配输入源尾部时使用, 显然 EOF 只能被匹配一次, 再次匹配会失败.

    ACTIONS-EOF

### CRLF

当需要在动作中记录行列位置时使用. 第三段表示回车风格.

    ACTIONS-CRLF          ---> ACTIONS-CRLF-ANYCRLF
    ACTIONS-CRLF-CR
    ACTIONS-CRLF-LF
    ACTIONS-CRLF-CRLF
    ACTIONS-CRLF-ANYCRLF

行列位置都从 1 开始, 保存在 action 中:

```yaml
loc:
  startLine: Int
  startCol: Int
  endLine: Int
  endCol: Int
```

注意: 由于处理过程中动作关系会变化, 所以 start, end, line, col 也会变.

### OUTDENT

当需要缩进语法(不是排版)时启用, 无需再写匹配行首缩进量的规则.
如果 CRLF 插件未被加载, 那么会加载 CRLF.
如果文法中加载了 CRLF, 那么必须在 OUTDENT 之前加载, 因为 OUTDENT 需要覆盖 CRLF 方法才能正确工作.

使用单词 `OUTDENT` 而不是 `INDENT` 是因为采用的算法逻辑为:

    缩进语法代码块从第二行开始, 行起始小于等于首行起始列时代码块结束
    除非指定列外的规则能通过检查

加载:

    ACTIONS-OUTDENT-SP  行首缩进符为空格(%x20)
    ACTIONS-OUTDENT-TAB 行首缩进符为水平制表符(%x09)
    ACTIONS-OUTDENT     等价 ACTIONS-OUTDENT-TA

触发:

    OUTDENT           开始缩进检查
    OUTDENT-allow-ref 如果通过 ref 规则检查允许一次例外

使用示例: 省略了一些规则的写法

```abnf
block     = OUTDENT statement

statement = IfStmt- / Block- / ForStmt-

IfStmt    = "if" *WSP "(" 1*cwsp expr-to-consequent 1*cwsp ")"
            OUTDENT-allow-braces *cwsp "{"
              block
            OUTDENT-allow-braces "}"
            [OUTDENT-allow-else else block-to-alternate]

Block     = "{" *cwsp block *cwsp "}"

braces    = "{" / "}
else      = *cwsp "else" 1*cwsp

expr      = OUTDENT (
              group-alone / UnaryExpr-prefix- / NumericExpr-
            ) [BinaryExpr-infix-left-]

Comment   = "//" *(%x20-7E)
cwsp      = Comment-mark- / CRLF / 1*SP
```


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