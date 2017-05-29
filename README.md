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

In all methods, only `lit`, `leaf`, `note` and `precedence` has the ability to extract the matching original string.
The extracted string is only stored in the raw attribute of the leaf node.

### lit

This method extracts the matching original string. Supports an empty string.

    ref-lit        Support stitching
    ref-lit-key    Support stitching
    ref-lit--type  Do not support stitching, equivalent ref-leaf--type

Stitching must avoid back, thousands of separated decimal places
 `.123'456'78` as an example:

```abnf
;incorrect = "." *(d3-lit "'") d12-lit
;because d3 will change the existing action when splicing
decimals   = "." (
              d4-lit /
              d3-lit *("'" d3-lit) ["'" d12-lit] /
              d12-lit
            )
d12        = 1*2DIGIT
d3         = 3DIGIT
d4         = 4*DIGIT
```

See [Thousand Separator Values] (# Demos).

### leaf

The method extracts the matching original string and generates the node. Supports the empty string.

    ref-leaf-[key]-[type]

### note

The method is dedicated to comment, Behavior consistent with leaf.

    ref-note-[key]-[type]

Note: In order to correctly calculate the operator, you must use this method with prefix and infix exclude non-operator.

### to

Does not generate an action, Reset the first action.key.
In fact 'to' is always replaced by an empty string.

    ref--key
    ref-to-key

### reset

Does not generate an action, Reset the first action.key and action.start.

    ref-reset
    ref-reset-key

See [if-here](#OUTDENT)

### amend

Exchange the location and key with the previous action.

    ref-amend--type     change type only
    ref-amend-key-type  exchange key only

See [Call-amend-func-](#OUTDENT)

Example: Used for Suffix Expression

```abnf
unaryExpr   = Number- / Identifier- [UpdateExpr-amend-operand-]
UpdateExpr  = update-lit-operator
update      = "++" / "--"
```

### prefix

Used for Prefix Expression.

    ref-prefix-[key]-type

Tip: The operator must have type.

### infix

Used for Infix Expression.
Hold the previous action to factors, and exchange key.

    ref-infix-[key]-type

The method must contain operator actions internally.

### operator

Used for binary operators. This method holds the matching original string.

    ref-operator-key

The priority in ref is sorted from low to high,
using pure string group substitution, and greedy matching. Example:

```abnf
BinaryExpr      = (
                    operatorSymbol-operator-operator /
                    operatorAlpha-operator-operator 1*cwsp
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

The method produces factors, Execute the build if the match is successful,
 Which can contain 0 or more child nodes (actions).

    ref-factors-[key]-[type]

See [OUTDENT](#OUTDENT).

Note: Build a dependency on the parent node to generate the factors and store the child nodes, but not recursively.

So the use of factors in the multi-level to get the correct results.

### list

The method behaves the same as the factors method, and ref generates the array element (key is the array).

    ref-list-[key]-[type]

See [OUTDENT](#OUTDENT).

### alone

The method produces factors, Execute the build if the match is successful,
 Generate a unique node (action).

    ref-alone-[key]-[type]

Commonly used in grouping expressions.

See [OUTDENT](#OUTDENT).

### ify

This method tests when ref passes, and returns to the previous state, optionally preserving the forward offset.

    ref-ify
    ref-ify-keep-pos
    ref-ify-any        === ref-ify-keep-pos
    ref-ify-any-string === ref-ify-keep-pos

### ifn

The method returns true when ref is passed, and does not return true.

    ref-ifn

# Actions

The core tool Actions generates AATs according to
 the rules that match the input source.

Understanding the following processing steps helps to
 properly use ABNFA grammar and develop plug-ins.

match:

From top to bottom to match, from bottom to top action.

Plugins are executed when an interrupt can be issued or a plugin event is created,
but note that the parent action may not be generated.

The matching process may directly generate sub factors, such as the either method

Each factors performs the build steps.

Construct:

First trigger plugin events, usually no need to deal with child factors.

Generates the child factors of the amend method

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

Returns the event object motion objects and more than a representation of the current index property factors.length

Trigger the event stage:

```js
function trigger(self, factors, event){}
```

Arguments

    self     The current Actions instance
    factors  Need to deal with the action array
    event    The event object

Returns a Boolean value indicating success or failure.

Here are the built-in plugins.

### ACTIONS

Load a plugin. Example: Load 'CRLF', 'FLAG'

```abnf
first = ACTIONS-CRLF ACTIONS-FLAG real-grammar-rule
```

### FLAG

Assigns the flag attribute to the last action last = factors [factors.length-1] in the current factors.


    FLAG-flags --> last.flag = (last.flag || '') + '-' + flags

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

### MUST

Subsequent matches must be successful and refuse to roll back.

    MUST

### OUTDENT

Supports indentation syntax, allowing consecutive blank lines.
Must be the first action within the alone or factors method.

Loding:

    ACTIONS-OUTDENT       Tab indentation(%x09)
    ACTIONS-OUTDENT-SP-N  N Spaces indentation(%x20)
    ACTIONS-OUTDENT-SP    Spaces indentation, Automatic calculation.

Must be in the factors [0], the alone or factors method can create new factors.

    OUTDENT            Automatic calculation aligned
    OUTDENT-aligned    Allow subsequent lines to align with the first line
    OUTDENT-       === OUTDENT-aligned
    OUTDENT-0      === OUTDENT- And is outdent when no indentation

Algorithm:

After executing OUTDENT, the indentation of the current line is calculated firstIndent, and the indentation decision is made in the subsequent CRLF action:

    Write down the current position
    Match 1 * CRLF, failed to return false.
    Write down the current position
    Calculate the indentation and determine the indentation by formula:
      Indent <firstIndent ||! Aligned && indent == firstIndent
    Is outdent, set the offset to failure, and return false
    Un-outdent, set offset successful + indent, return true.

Example: simplified Python if-else

```abnf
first      = ACTIONS-OUTDENT ACTIONS-DENY ACTIONS-FLAG topStmts
topStmts   = *CRLF statement *(CRLF statement) *CRLF
stmts      = OUTDENT CRLF statement *(CRLF statement)
statement  = if-here / expression

if         = "if" 1*SP ifCell-factors--if
ifCell     = OUTDENT- expression--test ":" *SP
             (expression--body / stmts-factors-body) FLAG
             [CRLF (else-here / elif-here)]
elif       = "elif" 1*SP ifCell-factors-orelse-if FLAG
else       = "else:" *SP (expression--orelse / stmts-factors-orelse) FLAG

ident      = Ident-lit- DENY-keywords [Call-amend-func-]
keywords   = "class"/ "if" / "else" / "elif"
Ident      = ALPHA *(ALPHA / DIGIT)
Num        = 1*DIGIT

expression = (ident / Num-lit- / Set-factors- / List-factors- / Dict-factors- / group-alone) *WSP
elements   = OUTDENT- [CRLF] expression *("," *WSP [CRLF] expression ) [CRLF]
group      = "(" OUTDENT- [CRLF] expression [CRLF] ")"

List       = "[" [elements-factors-elts FLAG] "]"
Set        = "{" [elements-factors-elts FLAG] "}"

Dict       = "{" [pairs] "}"
pair       = expression-alone-keys FLAG ":" *WSP expression-alone-values FLAG
pairs      = OUTDENT- [CRLF] pair *("," *WSP [CRLF] pair) [CRLF]

Call       = args-factors-args FLAG
args       = "()" / "(" [elements] ")"

WSP    = SP / HTAB
CWSP   = WSP / CRLF
HTAB   = %x09
SP     = %x20
ALPHA  = %x41-5A / %x61-7A
DIGIT  = %x30-39
```

### RAW

Check whether the raw attribute value of the previous action satisfies the condition.

    RAW-IS-tail   ---> prev.raw == tail
    RAW-UN-tail   ---> prev.raw != tail

Where `tail` is 'IS-' or 'UN-' after all the strings.

Example: ±Infinity, ±NaN

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

If the raw attribute of the previous action is equal to the optional string provided by rulename, terminate the matching process.

    DENY-rulename-[rulename]-[rulename]

Example:

```abnf
first      = ACTIONS-DENY Identifier- DENY-keywords-literal
Identifier = ALPHA *(ALPHA / DIGIT)
keywords   = "if" / "else" / "function"
literal    = "true" / "false" / "null"
ALPHA      = %x41-5A / %x61-7A
DIGIT      = %x30-39
```

### NON

If the raw attribute of the previous action is not equal to the optional string provided by rulename.

The difference between the plugin and DENY:

   1. Allow raw to be null
   2. Does not terminate the match

### SWAP

Swap the properties of the first two actions, key and flag.

    SWAP

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

The sample `+-0,234 678` adds the sign bit operation. Number is the structure.

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
Expression   = (Num- /
                Unary-prefix- /
                group-alone)
               [Binary-infix-left-]

group        = "(" Expression ")"
Unary        = minus-lit-op Expression--elt
Binary       = operator-operator-op Expression--right

Num          = 1*3DIGIT-lit *("," 3DIGIT-lit)
minus        = "-"
operator     = ("+" / "-") / ("*" / "/")
DIGIT        = %x30-39
```

Output of the sample `-1-2*-3`:

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