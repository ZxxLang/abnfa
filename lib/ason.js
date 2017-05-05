"use strict"

// The ABNFA Abstract Actions Tree Object Notation (ASON) Data Interchange Format
//
// protocol   = "ASON[" ASON "]"
// ASON       = ason *("," ason)
// ason       = "." / ; null
//              type [flag] [key] [rawstring / factors] /
//              [flag] [key] (rawstring / factors) /
//              "!" type [flag] [rawstring / factors] / ; note method
//              "!" [flag] (rawstring / factors)
//
// type       = name
// flag       = "-" name
// key        = ("+" / "~") name
// rawstring  = DQUOTE 1*char DQUOTE
// factors    = "[" ASON "]"
// name       = ALPHA *(ALPHA / DIGIT)
// char       = unescaped / escape (
//              %x22 /          ; "    quotation mark  U+0022
//              %x2F /          ; /    solidus         U+002F
//              %x5C /          ; \    reverse solidus U+005C
//              %x62 /          ; b    backspace       U+0008
//              %x66 /          ; f    form feed       U+000C
//              %x6E /          ; n    line feed       U+000A
//              %x72 /          ; r    carriage return U+000D
//              %x74 /          ; t    tab             U+0009
//              %x75 4HEXDIG )  ; uXXXX                U+XXXX
// escape     = %x5C            ; \
// unescaped  = %x20-21 / %x23-5B / %x5D-10FFFF
// ALPHA      = %x41-5A / %x61-7A
// DIGIT      = %x30-39
// DQUOTE     = %x22            ; "

function tab(i) {
    return i > 0 && '\n' + '\t'.repeat(i) || ''
}

function stringify(actions, indent) {
    return 'ASON[' + serialize(actions, indent) + ']'
}

function serialize(actions, indent) {
    indent = indent && 1 || 0
    return actions.reduce(function(ason, a, i) {
        if (i) ason += ','
        if (!a) return ason + '.'
        if (a.method == 'note') ason += '!'
        if (a.flag == '+') ason += '+'
        if (a.type) ason += a.type
        if (a.flag && a.flag != '+') ason += '-' + a.flag

        if (a.key) ason += '~' + a.key


        if (a.raw != null)
            ason += JSON.stringify(a.raw)
        else if (a.factors) {
            ason +=
                '[' + // tab(indent) +
                serialize(a.factors, indent && indent + 1 || 0) +
                //tab(indent) +
                ']'
        }

        return ason
    }, '')
}

exports.stringify = stringify
exports.serialize = serialize