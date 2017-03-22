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

action    = ref ["-" [type] [ "-" [method] [ "-" [key] [ "-" [flag] ]]]]

name      = ALPHA *(ALPHA / DIGIT)
ref       = name
type      = name
method    = name
key       = name
flag      = name
```

因该扩展描述了生成 AST 节点对象的动作信息, 被命名为 Actions.

# Specifications

约定:

1. 规则名大小写敏感
2. 符号 "-" 被 Action 专用
3. 匹配输入源时从首个规则名开始
4. 引用规则含有 Action 且被匹配的输入源才会被保留
5. 采用自顶向下描述

完整的规则引用格式为五段式:

    ref-type-method-key-flag

等价简写格式: 以 '-' 结尾, 表示 type 和 ref 同名.

    ref-                   === ref-ref
    ref-[to]-[key]-[flag]- === ref-ref-[to]-[key]-[flag]

核心工具依据文法规则解析输入字符串产生动作数组, 其元素结构为:

```yaml
start: Int
end: Int
raw: String
factors: Array(action)
precedence: Int
type: String
method: String
key: String
flag: String
```

该结构包含生成 AST 节点的信息.

    start      是该动作匹配输入的开始偏移量.
    end        是该动作匹配输入的结束偏移量(不包含 end).
    raw        匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    factors    参见 alone 方法以及运算符 flag. 与 raw 互斥.
    precedence 运算符优先级, 从 1 开始, 值越大优先级越高.
    其它源自 action 的属性, 依据节点关系某些属性值可能被更新.

## ref

真实引用规则名

## type

表示要生成的节点对象类型名称. 如果是字符串类型, 通常不需要设定该值.

## method

动作方法名, 指示动作间的关系或与 key, flag 配套表示如何分派属性.

简便起见, 下文按照自顶向下顺序对生成的动作进行如下命名:

    target 表示赋值目标对象, 通常是先前生成的动作.
    source 表示被赋值的对象, 通常被赋值到 target[key].

### to

当 ref 生成的 source 为结构体对象时使用该方法. 联用关系:

    ref-type-to-[key]-[flag]

### lit

当 ref 生成的 source 为字符串时使用该方法. 联用关系:

    ref--lit-[key]-[flag]
    ref--lit-key-("postfix" / "prefix" / "infix")

### fetch

基于 to 方法, 当需要执行 target[source[key]] = source 时使用该方法. 联用关系:

    ref-type-fetch-key-[flag]

### ahead

当 ref 生成的对象为 target, 先前生成的对象为 source 时使用. 联用关系:

    ref-type-ahead-key-[flag]

### inner

当 ref 生成的对象作为 source 时使用. 联用关系:

    ref--inner-[key]-[flag]

该格式类似不与 type 联用的 to 方法, 但语义更清晰.

### alone

当 ref 向内为独立部分时使用, 会产生动作元素的 factors 属性. 联用关系:

    ref--alone

典型用法: 表达式入口, 被括号包裹的, 被逗号分隔的, 表达式运算子等.

当 ref 作为表达式的运算子时必须使用 alone 方法来保障运算子的数量.

## key

赋值目标属性名称

## flag

    1. list    目标属性是数组, 向目标添加元素.
    2. true    设置目标属性值为 true.
    3. false   设置目标属性值为 false.
    4. infix   用于中缀(二元)运算符. target 有三个属性.
    5. prefix  用于前缀(一元右结合)运算符. target 有两个属性.
    6. postfix 用于后缀(一元左结合)运算符. target 有两个属性.

### precedences

使用运算符标记时 method 值必须为 'lit'.
含这些标记时会对整个数组按优先级进行整理, 生成动作元素的 factors 属性.

默认运算符标记优先级由高到低为: postfix, prefix, infix.
使用 infix 的 ref 采用字符串分组替代写法, 表示的运算符以优先级由低到高排列.
显然 infix 的上级必须使用 ahead 方法确定表达式的左侧.

# Demos

本节展示首个规则名表示目标对象, 向目标设置成员(属性或元素)的情况.

样本 `0234 678` 是以空格分隔的两个数值, 期望结果为数值数组, ABNFA 定义:

```abnf
Array     = 1*(num-Number-to--list [SP])
num       = 1*DIGIT--lit
DIGIT     = %x30-39
SP        = %x20
```

样本 `0,234 678` 增加了千位分隔符, ABNFA 定义:

```abnf
Array     = 1*(num-Number-to--list [SP])
num       = 1*3digit *("," 3digit)
digit     = DIGIT--lit
DIGIT     = %x30-39
SP        = %x20
```

样本 `-0,234 678` 增加了负号符号位, ABNFA 定义: 这个 Number 是无字段的.

```abnf
Array     = 1*(num-Number-to--list [SP])
num       = [sign--lit] 1*3digit *("," 3digit)
sign      = "-"
digit     = DIGIT--lit
DIGIT     = %x30-39
SP        = %x20
```

样本 `--0,234 678` 增加了负号符号位运算, ABNFA 定义: 这个 Number 是含字段的.

```abnf
Array     = 1*(num-Number-to--list [SP])
num       = *sign--lit-sign 1*3digit *("," 3digit)
sign      = "+" / "-"
digit     = DIGIT--lit-lit
DIGIT     = %x30-39
SP        = %x20
```

# Examples

以四则运算表达式为例, 使用 Web IDL 描述该表达式的传统 AST 结构:

```IDL
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
Expression  = ( groupExpr--alone /
              UnaryExpr-UnaryExpr  /
              NumericExpr-NumericExpr )
              [BinaryExpr-BinaryExpr-ahead-left]

groupExpr   = "(" Expression ")"

UnaryExpr   = minus--to-operator Expression--inner-operand
BinaryExpr  = operator--to-operator-binary Expression--inner-right
NumericExpr = 1*3DIGIT--lit
minus       = "-"
operator    = ("+" / "-") / ("*" / "/")
DIGIT       = %x30-39
```

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234