"use strict"

// The ABNFA Abstract Actions Tree Object Notation (ASON) Data Interchange Format
//
// protocol     = "ASON:[" ASON "]"
// ASON         = action *("," action)
// action       = [NoteMark] [type [flag]] [key] (rawstring / factors)
//
// NoteMark     = "!" ; the action is note node
// ArrayMark    = "+" ; the attribute `key` is an array
// NonArrayMark = "~" ; the attribute `key` is an non-array
// FlagMark     = "-" ; extra markup for type
//
// type         = name
// key          = (ArrayMark / NonArrayMark) name
// flag         = FlagMark 1*(ALPHA / DIGIT / "_" / "-")
//
// rawstring    = DQUOTE 1*char DQUOTE
// factors      = "[" [ASON] "]"
//
// name         = 1*(ALPHA / DIGIT / "_")
//
// char         = unescaped / escape (
//                %x22 /          ; "    quotation mark  U+0022
//                %x2F /          ; /    solidus         U+002F
//                %x5C /          ; \    reverse solidus U+005C
//                %x62 /          ; b    backspace       U+0008
//                %x66 /          ; f    form feed       U+000C
//                %x6E /          ; n    line feed       U+000A
//                %x72 /          ; r    carriage return U+000D
//                %x74 /          ; t    tab             U+0009
//                %x75 4HEXDIG )  ; uXXXX                U+XXXX
// escape       = %x5C            ; \
// unescaped    = %x20-21 / %x23-5B / %x5D-10FFFF
// ALPHA        = %x41-5A / %x61-7A
// DIGIT        = %x30-39
// DQUOTE       = %x22            ; "

let missing = 'ASON serialize failed, missing an Action';

function Serializer(asonHead, indent) {
    this.asonHead = asonHead && true || false
    this.indent = indent && 1 || 0
    this.prefix = indent && '\t'.repeat(indent - 1) || ''
}

Serializer.prototype.retrans = function(actions) {
    this.ason = '';
    actions && actions.length && actions.forEach(this.serialize, this)
    return this.asonHead && this.prefix + 'ASON:[' + this.ason + ']' ||
        this.ason;
}

Serializer.prototype.serialize = function(a, i) {
    this.ason += this.property(this.prefix + (i && ',' || ''), a);
    if (a.raw != null || !a.factors) return
    if (!a.factors.length) {
        this.ason += '[]';
        return
    }
    this.indent && this.indent++;
    this.ason += '[';
    a.factors.forEach(this.serialize, this)
    this.ason += ']'
    this.indent && this.indent--;
}

Serializer.prototype.property = function(ason, a) {
    if (!a) return ason + '.'
    if (a.method == 'note') ason += '!'

    if (a.flag && a.flag[0] == '+') ason += '+'
    if (a.type) ason += a.type
    if (a.flag) ason += a.flag[0] != '+' && a.flag ||
        a.flag.slice(1)

    if (a.key) ason += '~' + a.key

    if (a.raw != null)
        ason += JSON.stringify(a.raw)
    return ason
}

function tab(i) {
    return i > 0 && '\n' + '\t'.repeat(i) || ''
}

function stringify(actions, indent) {
    if (!indent) return 'ASON:[' + serialize(actions) + ']'
    return (new Serializer(true, indent)).retrans(actions)
}

function serialize(actions) {
    return actions.reduce(function(ason, a, i) {
        if (!a) throw new Error(missing)

        if (i) ason += ','
        if (a.method == 'note') ason += '!'

        if (a.type) ason += a.type

        if (a.flag) {
            if (a.flag[0] != '+') {
                if (!a.type) throw new Error(
                    missing + '.type before FLAG' + a.flag)
                ason += a.flag + (a.key && '~' + a.key || '')
            } else if (a.key)
                ason += a.flag.slice(1) + '+' + a.key
            else throw new Error(
                missing + '.key before FLAG' + a.flag)
        } else if (a.key) ason += '~' + a.key

        if (a.raw != null)
            ason += JSON.stringify(a.raw)
        else if (a.factors)
            ason += '[' + serialize(a.factors) + ']'

        return ason
    }, '')
}

exports.stringify = stringify
exports.serialize = serialize