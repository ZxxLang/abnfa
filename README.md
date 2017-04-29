# ABNFA

ABNFA based on [ABNF][] to extend the action semantics of the reference rules
 to provide a tool chain for generating AST.

Original definition:

```abnf
rule      =  rulename defined-as elements c-nl
rulename  =  ALPHA *(ALPHA / DIGIT / "-")
```

Definition of ABNFA:

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

The structure of action:

```yaml
action:
  ref: String
  tail: String
  method: String
  key: String
  type: String
```

The structure contains information about how to generate the AST node object, so the extension is named Actions.

# Specifications

1. Case sensitive
2. The symbol "-" is used as a delimiter
3. Match the input source from the first rule
4. The grammar description order is top-down, from left to right
5. The `""` in `rule = "" other` is always matched failed
6. The `tail` stored after the `action.ref` string
7. The action with `method` or `key` or `type` produces Action object

Equivalent shorthand format: ends with '-', indicating the same name as type and ref.

    ref-                   === ref---ref
    ref-method-            === ref-method--ref
    ref-method-key-        === ref-method-key-ref
    ref-method-key-more-   === ref-method-key-ref-more

An array of actions is generated after the final match of the input source, which is called Abstract Actions Tree (AAT).

The AAT element is the action object and contains information that generates the AST node.
In the following, the word `action 'represents the element of the action array, and` node' means the AST node.

Action object structure:


```yaml
Action:
  start: 0        # The action matches the start offset of the input
  end: 1          # The end offset of the action match input (not including end)
  type: string    # The name of type of AST node
  key: string     # The name of the node in the parent node
  raw: string     # for the leaf node, leaving the matching original string
  method: string  # that how to assign to the parent node, three categories
                  #   note  means annotation node
                  #   push  means parentNode[key].push(thisNode)
                  #   otherwise means parentNode[key] = thisNode
                  #
  factors:        # Used for array or non-leaf nodes.
    - Action:     #
  precedence: 1   # Used for binary operation expression
  flag: string    # Generates extra markup for the node, see [FLAG](#FLAG)
  loc:            # The position of the parsed source region, see [CRLF](#CRLF)
    startLine: 1
    startCol: 1
    endLine: 2
    endCol: 1
```

The structure is very close to AST, but the attribute is inside the factors.

## methods

This section details the available methods and the combability with key and type.

In all methods, only lit and precedence will hold the matching raw string.

### lit

Used when you need to save the matching raw string.
See [Thousand Separator Values] (# Demos).

    ref-lit        支持拼接
    ref-lit-key    支持拼接
    ref-lit--type  不支持拼接

### to

Can be omitted, to the target attribute directly assigned.
In fact 'to' is always replaced by an empty string.

    ref-to-key-[type] ---> ref--key-[type]

### push

The target attribute is an array.

    ref-push-[key]-[type]

### precedence

Used for binary operators. This method holds the matching raw string.

    ref-precedence-key

The priority in ref is sorted from low to high,
using pure string group substitution, and greedy matching. Example:

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

In this example, the operator rules are divided into two groups,
and the string operator is checked to the right of the string operator.

Note: The minimum value of precedence is from 1.

### factors

The method produces factors.

    ref-factors-[key]-[type]

Commonly used in arrays, parameter lists and so on.

### alone

The method produces factors. 当 factors 内仅有一个动作时提升为当前动作.

    ref-alone-[key]-[type]

Commonly used in grouping expressions.

### ahead

The method produces factors. Hold the previous action to factors,
and exchange key and type.

    ref-ahead-[key]-[type]

Example: Used for Suffix Expression, in this case Identifier- no key required

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-ahead-argument-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

Note: Compared to prefix and infix, ahead does not check the operators and operators.

### prefix

The method produces factors. Used for Prefix Expression.

    ref-prefix-[key]-type

提示: 运算子必须具有 type

### infix

The method produces factors. Used for Infix Expression.
Hold the previous action to factors, and exchange key and type.

    ref-infix-[key]-type

### next

Does not generate an action, only set the key for subsequent actions.
Can be used with ahead, prefix, infix.

    ref-next-key

### note

The action for the note, with ahead, prefix, infix can exclude non-operator.

    ref-note-[key]-[type]

Note: For proper calculation of operators, non-operators must use this method.

# Actions

The core tool Actions generates AATs according to
 the rules that match the input source.

Understanding the following build steps helps to
 properly use ABNFA grammar and develop plug-ins.

match:

From top to bottom to match, from bottom to top action.

Plugins are executed when an interrupt can be issued or a plugin event is created,
but note that the parent action may not be generated.

The matching process may directly generate sub factors, such as the either method

Each factors performs the build steps.

Construct:

First trigger plugin events, usually no need to deal with child factors.

Generates the child factors of the ahead method

Generates the seed factors of the prefix method

Generates the child factors of the infix method

Other methods based on start, end generated child factors

## plugins

The plugin function can be passed through the second parameter of new Actions or
 by using the addPlugins method.

Loading stage:

Must be in front of the first rule (in fact ACTIONS is the built-in plugin).

    ACTIONS-PluginName-[args]-[args]-[args]

If the self-loading function `LOAD_PluginName` is executed,
 otherwise execute` PluginName`.

```js
function LoadOrExecutePlugin(rule, self): bool {}
```

Arguments

    rule   Contains the rules defined by the action.
    self   The current Actions instance

Returns a Boolean value indicating success or failure.

Execute stage:

Ref means the name of the plugin with ref in grammar.

An interrupt is issued when the plugin is executed successfully and
 needs to be interrupted when subsequent matching is used:

Set the `break` property of the Actions instance to true and
 return true to indicate success

If needed. Generate an event by calling the before method of the Actions instance.

```js
function before(type, method, key){}
```

Arguments

    type   Event function name, plugin function 'ON_type' must exist.
    method Additional argument are saved in the `method` attribute
    key    Additional argument are saved in the `key` attribute

Returns a Boolean value indicating success or failure.

Trigger the event stage:

```js
function event(self, factors, index, node){}
```

Arguments

    self     The current Actions instance
    factors  Need to deal with the action array
    index    The event in the index of factors, factors[index] is null
    node     The event node value, factors[index]

Returns a Boolean value indicating success or failure.

Here are the built-in plugins.

### ACTIONS

Load a plugin. Example: Load 'EOF', 'CRLF'

```abnf
first = ACTIONS-CRLF ACTIONS-EOF real-grammar-rule
```

### FLAG

Forward a flag attribute with a type action.

    FLAG-flag-[flag...] --> previousAction.flag = flag

### EOF

Matches the end of the input source.

    EOF

### CRLF

The ranks are always recorded in the action. The plugin is always executed first.

    CRLF

Line number and column number from 1, save in the `loc` attribute of Action:

```yaml
Action:
  loc:
    startLine: 1
    startCol: 1
    endLine: 1
    endCol: 2
```

### OWN

Requires a specified attribute name

    OWN-key-[key...]

### OUTDENT

Supports indentation syntax, allowing consecutive blank lines.
Must be the first action within the alone or factors method.

Loding:

    ACTIONS-OUTDENT-SP       Space indentation(%x20)
    ACTIONS-OUTDENT-TAB      Tab indentation(%x09)
    ACTIONS-OUTDENT     === ACTIONS-OUTDENT-TAB

The plug-in relies on the CRLF plug-in, which will automatically load the CRLF
 if the CRLF is not loaded.

    OUTDENT-[allow]-[deny]

Algorithm:

    col <  startCol Determine the outdent.
    col >  startCol The `deny` test failed to continue, otherwise the decision failed.
    col == startCol The `allow` test success to continue , otherwise determine the outdent.

Example: Some rules are omitted

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

Check the raw attribute of the previous action and reject the string string value provided by ref.
If the refusal will cause the resolution to fail.

    DENY-ref

Example:

```abnf
first      = ACTIONS-DENY Identifier- DENY-keywords
Identifier = ALPHA *(ALPHA / DIGIT)
keywords   = "if" / "else" / "function"
ALPHA      = %x41-5A / %x61-7A
DIGIT      = %x30-39
```

# Demos

This section shows the first rule name that indicates the target object,
 setting the member (attribute or element) to the target.

Sample `0234 678` is a space-separated two values,
 expect the result as an array of values:

```abnf
Array     = 1*(Number- [SP])
Number    = 1*DIGIT-lit
DIGIT     = %x30-39
SP        = %x20
```

Sample `0,234 678` adds thousands separators:

```abnf
Array  = 1*(Number- [SP])
Number = 1*3DIGIT-lit *("," 3DIGIT-lit)
DIGIT  = %x30-39
SP     = %x20
```

The sample `-0,234 678` adds a negative sign bit, Number is non-structure:

```abnf
Array  = 1*(Number- [SP])
Number = [sign-lit] 1*3DIGIT-lit *("," 3DIGIT-lit)
sign   = "-"
DIGIT  = %x30-39
SP     = %x20
```

Output:

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

The sample `+ -0,234 678` adds the sign bit operation. Number is the structure.

```abnf
Array  = 1*(Number- [SP])
Number = *sign-lit-sign 1*3DIGIT-lit-raw *("," 3DIGIT-lit-raw)
sign   = "-" / "+"
DIGIT  = %x30-39
SP     = %x20
```

Output:

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

Four expression expressions that support thousands of delimiter values

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

Output of the sample `-1-2*-3`:

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