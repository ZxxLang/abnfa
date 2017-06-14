"use strict"

// The ABNFA Abstract Actions Tree Object Notation (ASON) Data Interchange Format
//
// protocol     = "ASON:[" ASON "]"
// ASON         = action *("," action)
// action       = [type [flag]] [key] (rawstring / factors)
//
// FlagMark     = "-" ; markup for  flag
// NoteMark     = "!" ; markup for 'note' method
// ListMark     = "+" ; markup for 'list' method
// OtherMark    = "~" ; markup for  other method
//
// type         = name
// key          = (NoteMark / ArrayMark / OtherMark) name
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


function Serializer(asonHead, indent) {
    this.asonHead = asonHead && true || false
    this.indent = indent && 1 || 0
    this.prefix = indent && '\t'.repeat(indent - 1) || ''
}

Serializer.prototype.serialize = function(actions) {
    this.ason = '';
    actions && actions.length && actions.forEach(walk, this)
    return this.asonHead && this.prefix + 'ASON:[' + this.ason + ']' ||
        this.ason;
}

function walk(a, i) {
    this.ason += property(this.prefix + (i && ',' || ''), a);
    if (a.raw != null || !a.factors) return
    if (!a.factors.length) return this.ason += '[]';

    this.indent && this.indent++;
    this.ason += '[';
    a.factors.forEach(walk, this)
    this.ason += ']'
    this.indent && this.indent--;
}

function property(ason, a) {
    if (!a) return ason + '.'
    if (a.method == 'note')
        ason += '!'

    if (a.flag && a.flag[0] == '+')
        ason += '+'
    if (a.type)
        ason += a.type
    if (a.flag)
        ason += a.flag[0] != '+' && a.flag ||
        a.flag.slice(1)

    if (a.key)
        ason += '~' + a.key

    if (a.raw != null)
        ason += JSON.stringify(a.raw)
    return ason
}

function stringify(actions, indent) {
    if (!indent) return 'ASON:[' + serialize(actions) + ']'
    return (new Serializer(true, indent)).serialize(actions)
}

function serialize(actions) {
    return actions.reduce(function(ason, a, i) {
        if (!a)
            throw new Error('ASON serialize failed, missing an Action')

        if (i)
            ason += ','

        if (a.type)
            ason += a.type
        if (a.flag)
            ason += a.flag

        if (a.key)
            ason += (
            a.method == 'list' && '+' ||
            a.method == 'note' && '!' || '~'
            ) + a.key

        if (a.raw != null)
            ason += JSON.stringify(a.raw)
        else if (a.factors)
            ason += '[' + serialize(a.factors) + ']'

        return ason
    }, '')
}


function clean(actions) {
    return actions.reduce(function(list, a, i) {
        var o = Object.create(null);

        if (!a)
            throw new Error('ASON clean failed, missing an Action')

        list.push(o)

        if (a.type)
            o.type = a.type

        if (a.key) {
            o.key = (
            a.method == 'list' && '+' ||
            a.method == 'note' && '!' || '~'
            ) + a.key
        }


        if (a.flag)
            o.flag = a.flag

        if (a.raw != null)
            o.raw = a.raw
        else if (a.factors)
            o.factors = clean(a.factors)

        return list
    }, [])
}

exports.stringify = stringify
exports.serialize = serialize
exports.clean = clean
