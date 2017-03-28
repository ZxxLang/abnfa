# ABNFA

ABNFA 基于 [ABNF][] 是自顶向下，自左向右语法对规则名引用扩展动作语义, 提供生成 AST 节点对象信息和向前检查对象类型能力.

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

该结构包含生成 AST 节点的信息.

    start      是该动作匹配输入的开始偏移量.
    end        是该动作匹配输入的结束偏移量(不包含 end).
    raw        匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    factors    表示同级别分组, 与 raw 互斥. 参见 alone 方法以及运算符.
    precedence 运算符优先级, 从 1 开始, 值越大优先级越高.
    其它源自 action 的属性, 依据节点关系 method 值会被更新.

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

动作方法名, 指示动作间的关系以及 AST 上下级节点的关系.

简便起见, 下文按照自顶向下顺序对生成的动作进行如下命名:

    source 动作对象, 通常由 ref 生成.
    target 动作对象, 通常由上级规则生成.
    node   节点对象, source 对应的 AST 节点.
    parent 节点对象, target 对应的 AST 节点.

核心工具不生成和操作 node 和 parent, 下面的描述只表示常规做法.

### lit

当 ref 内没有动作, source 为字符串时使用该方法.

    ref-lit     ---> target.raw  = source
    ref-lit-key ---> parent[key] = node

### precedence

当 ref 为运算符且需要计算优先级时使用. 这是 lit 的特例, 成功后会更名为 lit.

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

### to

该方法必须与 type 组合使用.

    ref-to-     ---> parent.push(node)
    ref-to-key- ---> parent[key] = node

### ahead

当 ref 生成 target, 先前生成动作为 source 时使用. 成功后会更名为 to.

    ref-ahead-key- ---> target.key, source.key = source.key, target.key

ahead 可用于一元后缀表达式. 示例: 该例中 Identifier- 不需要 key

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-ahead-argument]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

### prefix

当 ref 为一元前缀表达式时使用.

    ref-prefix-     ---> parent.push(node)
    ref-prefix-key- ---> parent[key] = node

### infix

当 ref 为二元中缀表达式时使用.

    ref-infix-     ---> parent.push(node)
    ref-infix-key- ---> parent[key] = node

### alone

当 ref 生成独立的 source 时使用, source 的归属由上层确定.

    ref-alone ---> source.factors = []

常用于表达式入口, 被括号包裹的, 被逗号分隔的, 表达式运算子等.

核心工具在 ref 匹配成功后对 source.factors 进行分组合并.

### inner

当 ref 生成的第一个非 mark 动作为 source 时使用.

    ref-inner     ---> parent.push(node)
    ref-inner-key ---> parent[key] = node

### fetch

该方法必须与 type 组合使用.

    ref-fetch-key- ---> parent[node[key]] = node

该动作总是被保留, 并且:

 - 不参与表达式中的运算数数量计算

### mark

当 source 或 node 需要被特殊处理时使用.

    ref-mark-[key]-[type]-[extra]

该动作总是被保留, 并且:

 - 不参与表达式中的运算数数量计算

典型的应用场景:

 - 注释
 - 版式相关
 - 给 AST 节点设置附加属性

# Actions

Actions 依据文法规则匹配输入源生成动作数组, 并对动作进行归纳分组生成 factors.

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