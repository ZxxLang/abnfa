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

action    = refname ["-" [produce] [ "-" [method] [ "-" [key] [ "-" [flag] ]]]]

name      = ALPHA *(ALPHA / DIGIT)
refname   = name
produce   = name
method    = name
key       = name
flag      = name
```

完整的规则引用格式为五段式:

    refname-produce-method-key-flag

因该扩展描述了生成 AST 节点对象的动作信息, 被命名为 Actions.

# Specifications

约定:

1. 规则名大小写敏感
2. 符号 "-" 被 Action 专用
3. 匹配输入源时从首个规则名开始
4. 引用规则含有 Action 且被匹配的输入源才会被保留
5. 采用自顶向下描述

核心工具依据文法规则解析输入字符串产生动作数组, 其元素结构为:

```yaml
group: Number
start: Number
end: Number
raw: String
produce: String
method: String
key: String
flag: String
```

该结构包含生成 AST 节点的信息.

    group   用来判定前后元素间的关系.
    start   是该动作匹配输入的开始偏移量.
    end     是该动作匹配输入的结束偏移量(不包含 end).
    raw     匹配并被保留的原始字符串, 未定义 action 的匹配字符串被抛弃.
    其它为 action 的属性, 依据节点关系某些属性值可能被更新.

## refname

真实引用规则名

## produce

表示要生成的节点对象类型名称. 如果是字符串类型, 通常不需要设定该值.

## method

动作方法名, 指示动作间的关系或与 key, flag 配套表示如何分派属性.

简便起见, 下文按照自顶向下顺序对生成的动作进行如下命名:

    prev  表示左侧或者上层含 produce 的动作
    next  表示右侧或者下层含 produce 的动作或匹配字符串
    this  表示当前生成的动作

推导出 prev, key 和 next 后, 节点关系为: next 赋值到 prev[key]

### to

当 next 为结构体对象时使用该方法, 必须和 key 联用.

### lit

当 next 为字符串时使用该方法, 可选和 key 联用.

### fetch

当需要提取 next[key] 作为 next 进行赋值时使用该方法, 必须和 key 联用.

### ahead

查找 prev.group == this.group 的 prev 节点位置替换为 this, 它们的属性可能被调整.

### behind

查找 next.group == this.group 的 next 节点并调整 next 的属性.

### group

当 refname 为独立分组时使用该方法, 该方法为 ahead, behind 提供了判断依据.
典型的场景比如圆括号包裹的表达式.

## key

目标属性名称

## flag

    1. list    目标属性是数组, 向目标添加元素.
    2. true    设置目标属性值为 true.
    3. false   设置目标属性值为 false.
    4. binary  用于二元运算符, refname 为运算符规则名, 优先级由低到高替代排列.
    5. left    用于一元运算符, 向左结合.
    6. right   用于一元运算符, 向右结合.

显然 binary, left, right 对应的方法必须为 lit.

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

以支持千位分隔符的四则运算为例, 使用 Web IDL 描述含二元表达式的传统 AST 结构:

```IDL
enum UnaryOperator { "-" };

enum BinaryOperator { "+", "-", "*", "/" };

interface Expression : Node { };

interface ArithmeticExpr : Expression { };

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
  attribute double value;
};
```

ABNFA 定义

```abnf
ArithmeticExpr  = ( "(" ArithmeticExpr ")" /
                  UnaryExpr-UnaryExpr  /
                  NumericExpr-NumericExpr )
                  [BinaryExpr-BinaryExpr-ahead-left]

UnaryExpr       = minus--to-operator ArithmeticExpr--behind-operand
BinaryExpr      = operator--to-operator-binary ArithmeticExpr--behind-right
NumericExpr     = thousands
minus       = "-"
operator    = ("+" / "-") / ("*" / "/")
thousands   = 1*3DIGIT--lit *("," 3DIGIT--lit)
DIGIT       = %x30-39
```

# License

BSD 2-Clause License

Copyright (c) 2016, YU HengChun <achun.shx@qq.com>
All rights reserved.

[ABNF]: https://tools.ietf.org/html/rfc5234