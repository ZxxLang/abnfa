"use strict"
var helper = require('./helper');

function alpha(c) {
    return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

function bit(c) {
    return c == '0' || c == '1'
}

function digit(c) {
    return c >= '0' && c <= '9'
}

function hexdig(c) {
    return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' ||
        c >= 'A' && c <= 'F'
}

function vchar(c) {
    // for comment only
    return c == 0x09 || uvchar(c)
}

function quote(c) {
    return c != 0x27 && uvchar(c)
}

function string(c) {
    return c != 0x22 && uvchar(c)
}

function uvchar(c) {
    //  UNICODE VCHAR
    return c >= 0x20 && c <= 0x7E ||
        c >= 0x00A1 && c <= 0x167F || c >= 0x1681 && c <= 0x1FFF ||
        c >= 0x200B && c <= 0x2027 || c >= 0x202A && c <= 0x202E ||
        c >= 0x2030 && c <= 0x205E || c >= 0x2060 && c <= 0x2FFF ||
        c >= 0x3001 && c <= 0xD7FF ||
        c >= 0xF900 && c <= 0xFDCF || c >= 0xFDF0 && c <= 0xFFFD ||
        c >= 0x10000 && c <= 0x1FFFD || c >= 0x20000 && c <= 0x2FFFD ||
        c >= 0x30000 && c <= 0x3FFFD || c >= 0x40000 && c <= 0x4FFFD ||
        c >= 0x50000 && c <= 0x5FFFD || c >= 0x60000 && c <= 0x6FFFD ||
        c >= 0x70000 && c <= 0x7FFFD || c >= 0x80000 && c <= 0x8FFFD ||
        c >= 0x90000 && c <= 0x9FFFD || c >= 0xA0000 && c <= 0xAFFFD ||
        c >= 0xB0000 && c <= 0xBFFFD || c >= 0xC0000 && c <= 0xCFFFD ||
        c >= 0xD0000 && c <= 0xDFFFD || c >= 0xE0000 && c <= 0xEFFFD ||
        c == 0x00A0 || c == 0x1680 || c >= 0x2000 && c <= 0x200A ||
        c == 0x202F || c == 0x205F || c == 0x3000
}

function toTok(start, form, raw) {
    var tok = {
        form: form,
        raw: raw,
        start: {
            offset: start.offset,
            line: start.line,
            col: start.col
        }
    }
    start.offset += raw.length
    if (form == 'C') { // crlf
        start.line++;
        start.col = 0
    } else {
        start.col += raw.length
    }
    return tok
}

function Retrans(...next) {
    // Retrans is compatible with continuous reduce or transform behavior.
    //     reduce
    //          .retrans(any)  results null | Error
    //          .retrans(null) results Object | Array | Error
    //
    //     transform
    //          .retrans(any)  results Object | Array | Error
    //          .retrans(null) results null | Error
    //
    // next  .prototype.retrans or .retrans
    //
    // .retrans(any)
    //     results
    //         Error    on any error
    //         array    if !next.length
    //         any      next.retrans(array) || next.retrans(null)
    //
    // Example for transform
    //     var form = {};
    //     form.retrans = function(s) {
    //         return s!=null && s + s || null
    //     }
    //     var ret = new Retrans(Trans, form);
    //     ret.retrans(1)
    //     ret.retrans(2)
    //     ret.retrans(null)
    //     [2, 4]
    //
    this.next = next.map(function(n) {
        return helper.retrans(n)
    }).filter(function(n) {
        return n
    })

    this.list = []
}

Retrans.prototype.retrans = function retrans(any) {
    if (null != any) {
        if (any instanceof Error) return any
        this.list.push(any)
        return
    }

    return this.next.reduce(function(v, c, i) {
        if (null == v || v instanceof Error) return v
        if (!i || !(v instanceof Array))
            return c.retrans(v) || c.retrans(null)

        var r,
            list = []
        for (i = 0; i < v.length; i++) {
            r = c.retrans(v[i])
            if (r instanceof Error) return r
            if (null != r) list.push(r) // transform and filter
        }

        r = c.retrans(null)
        if (!list.length) return r; // reduce
        // transform and filter
        if (null != r) list.push(r);
        return list.length && list || null
    }, this.list)
}

function Trans() {
    // .retrans(any) results any
}

Trans.prototype.retrans = function retrans(any) {
    return any
}

function Entries() {
    // entries is simple splitter through rulename and comment / c-wsp
    //
    // .retrans(tokens)
    //     reduce and results [tokens]:
    //         [c-nl ...]    tokens of un-rule
    //         [R, c-nl ...] tokens of a rulename
    //         null          on <<EOF>>
    this.entries = []
}

Entries.prototype.retrans = function retrans(tokens) {
    var i,
        j,
        rule;
    if (null == tokens) return this.entries

    for (i = 0; i < tokens.length;) {
        rule = null;
        for (j = i; j < tokens.length; j++)
            if (tokens[j].form == 'R') { // rulename
                rule = tokens[j]
                break
        }

        i != j && this.entries.push(tokens.slice(i, j))
        if (!rule) break

        i = j
        for (j++; j < tokens.length; j++)
            if (tokens[j].start.col <= rule.start.col &&
                ['W', 'C'].indexOf(tokens[j].form) == -1) break

        this.entries.push(tokens.slice(i, j))
        i = j
    }
}

function tokenize(s, ...collector) {
    // tokenize is a lexical parser, merge consecutive spaces and htab.
    //
    // s          ABNF strings
    // collector  token collector, collector = new Retrans(...collector)
    //
    // results
    //     SyntaxError    on syntax error
    //     any            collector.push(token || null)
    //
    // token {
    //     form: String(formal-sring),
    //     raw: String(raw-sring),
    //     start: {
    //         offset: Number(offset),
    //         line: Number(line),
    //         col: Number(column-on-the-line)
    //     }
    // }
    //
    // form raw
    // ''   '"'                                       ; can be ignore
    // ''   "'"                                       ; can be ignore
    // ''   '%s'                                      ; can be ignore
    // ''   '%i'                                      ; can be ignore
    // ''   '%b'                                      ; can be ignore
    // ''   '%d'                                      ; can be ignore
    // ''   '%x'                                      ; can be ignore
    // 'W'  1*(1*%x09 / 1*%x20)                       ; can be ignore WSP
    // 'C'  (%x0D %x0A) / %x0D / %x0A                 ; can be ignore crlf
    //
    // 'R'  ALPHA *(ALPHA / DIGIT / "-")              ; rulename
    // '='  "=" / "=/"                                ; defined-as
    // ';'  ";" *(WSP / VCHAR)                        ; comment
    // '*'  (*HEXDIG "*" *HEXDIG) / 1*HEXDIG          ; repeat
    //
    // 'Q'  *(%x20-7E)                                ; DQUOTE or QUOTE string
    // 's'  *(%x20-7E)                                ; case-sensitive string
    // 'i'  *(%x20-7E)                                ; case-insensitive string
    // 'b'  1*BIT [1*("." 1*BIT) / ("-" 1*BIT)]       ; bin-vals or range
    // 'd'  1*DIGIT [1*("." 1*DIGIT) / ("-" 1*DIGIT)] ; dec-vals or range
    // 'x'  1*BIT [1*("." 1*BIT) / ("-" 1*BIT)]       ; hex-vals or range
    //
    // '('  '('                                       ; group open
    // ')'  ')'                                       ; group close
    // '['  '['                                       ; optional open
    // ']'  ']'                                       ; optional close
    // '<'  '<'                                       ; prose open
    // '>'  '>'                                       ; prose close
    // '/'  '/'                                       ; alternation
    var prob,
        i = s.search(/\r\n|\n|\r/),
        crlf = (i == -1 || s[i] == '\n') && '\n' ||
            s[i + 1] == '\n' && '\r\n' || '\r';

    var start = {
        offset: 0,
        line: 1,
        col: 0
    }

    collector = new Retrans(...collector);

    var rcol = 0,
        defas = -1,
        prev = '',
        right = '';

    var x,
        l,
        form,
        c,
        valid;
    i = 0
    while (i < s.length) {
        l = i
        form = ''
        c = s[i]
        if (c == ' ' || c == '\t') {
            l++
            form = 'W' // wsp
            while (s[l] == ' ' || s[l] == '\t') l++
        } else if (c == '\r' || c == '\n') {
            form = 'C' // crlf
            l += crlf.length
        } else if (c == ';') {
            form = c // comment
            l++
            while (vchar(s.charCodeAt(l))) l++;
        } else if (alpha(c)) {
            form = 'R'
            if (start.col <= rcol || defas == -1) {

                if (right) return helper.syntaxError(
                        'unexpected incomplete matching brackets previous rule',
                        s.slice(i).split(crlf, 1)[0], start);

                if (!defas || ')]>rnt'.indexOf(prev) == -1)
                    return helper.syntaxError(
                        'unexpected incomplete previous rule',
                        s.slice(i).split(crlf, 1)[0], start);

                defas = 0
                rcol = start.col
                prev = 'd' // def
            } else if (defas == 1)
                prev = 'r' // ref
            else return helper.syntaxError(
                    'expected defined-as', s.slice(i, l), start)
            l++
            c = 0
            while (alpha(s[l]) || digit(s[l]) || s[l] == '-' || c && s[l] == '_') {
                if (s[l] == '-') {
                    c = 1
                    if (!defas) return helper.syntaxError(
                            'unexpected rulename includes "-"', s.slice(i, l), start)
                }
                l++;
            }
        } else if (start.col <= rcol) {
            return helper.syntaxError(
                'unexpected symbols', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '/') {
            if (start.col <= rcol || ')]>rnt'.indexOf(prev) == -1) return helper.syntaxError(
                    'unexpected incremental alternatives',
                    s.slice(i).split(crlf, 1)[0], start);
            form = c
            prev = c
            l++
        } else if (')]>'.indexOf(c) != -1) {

            if (c != right[0]) return helper.syntaxError(
                    c == '>' &&
                    'unexpected incomplete matching angle brackets previous rule' ||
                    'unexpected incomplete matching brackets previous rule',
                    s.slice(i).split(crlf, 1)[0], start);

            form = c
            right = right.slice(1)
            prev = c
            l++
        } else if (c == '(') {
            form = c
            right = ')' + right
            prev = c
            l++
        } else if (c == '[') {
            form = c
            right = ']' + right
            prev = c
            l++
        } else if (c == '<') {
            form = c
            right = '>' + right
            prev = c
            l++
        } else if (c == '*' || digit(c)) {
            prev = '*'
            form = '*' // repeat
            l++
            while (digit(s[l])) l++;
            if (c != '*' && s[l] == '*') {
                l++
                while (digit(s[l])) l++;
            }
            c = s[l]
            if (!alpha(c) && '(%"\'<'.indexOf(c) == -1)
                return helper.syntaxError(
                    'unexpected symbols after repeat', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '"') {
            prev = 't'
            l++
            while (string(s.charCodeAt(l))) l++;
            if (s[l] != c)
                return helper.syntaxError(
                    'expected DQUOTE *(%x20-21 / %x23-7E) DQUOTE',
                    s.slice(i).split(crlf, 1)[0], start);

            prob = collector.retrans(toTok(start, '', c)) ||
            collector.retrans(toTok(start, 'Q', s.slice(i + 1, l))) ||
            collector.retrans(toTok(start, '', c))

            if (prob) return prob

            l++
            i = l
            continue
        } else if (c == "'") {
            prev = 't'
            l++
            while (quote(s.charCodeAt(l))) l++;
            if (s[l] != c)
                return helper.syntaxError(
                    'expected QUOTE *(%x20-26 / %x28-7E) QUOTE',
                    s.slice(i).split(crlf, 1)[0], start);

            prob = collector.retrans(toTok(start, '', c)) ||
            collector.retrans(toTok(start, 'Q', s.slice(i + 1, l))) ||
            collector.retrans(toTok(start, '', c))

            if (prob) return prob

            l++
            i = l
            continue
        } else if (c == '=') {
            form = c;
            if (defas || prev != 'd')
                return helper.syntaxError('unexpected defined-as', s.slice(i, l), start)
            defas = 1
            prev = c
            l += s[i + 1] == '/' && 2 || 1
        } else if (c == '%') {
            c = s[l + 1]
            if (c == 'i' || c == 's') {
                prev = 't'
                l += 2
                if (s[l] == '"') {
                    l++
                    while (string(s.charCodeAt(l))) l++;
                }

                if (s[l] != '"') return helper.syntaxError(
                        'expected ("%i" / "%s") DQUOTE *(%x20-21 / %x23-7E) DQUOTE',
                        s.slice(i).split(crlf, 1)[0], start)

                prob = collector.retrans(toTok(start, '', s.slice(i, i + 2))) ||
                collector.retrans(toTok(start, '', '"')) ||
                collector.retrans(toTok(start, c, s.slice(i + 3, l))) ||
                collector.retrans(toTok(start, '', '"'))

                if (prob) return prob
                l++
                i = l
                continue
            } else if (c == 'b' || c == 'd' || c == 'x') {
                prev = 'n'
                l += 2
                form = c
                valid = c == 'b' && bit || c == 'd' && digit || c == 'x' && hexdig
                x = l
                while (valid(s[l])) l++;

                if (l == x || c == 'x' && l - x > 8) return helper.syntaxError(
                        c == 'b' && 'expected "%b" 1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]' ||
                        c == 'd' && 'expected "%d" 1*DIGIT [ 1*("." 1*DIGIT) / ("-" 1*DIGIT) ]' ||
                        'expected "%x" 1*8HEXDIG [ 1*("." 1*8HEXDIG) / ("-" 1*8HEXDIG) ]',
                        s.slice(x).split(crlf, 1)[0], start)

                if (s[l] == '-') {
                    l++
                    x = l
                    while (valid(s[l])) l++;

                    if (l == x || c == 'x' && l - x > 8) helper.syntaxError(
                            c == 'b' && 'expected "%b" 1*BIT "-" 1*BIT' ||
                            c == 'd' && 'expected "%d" 1*DIGIT "-" 1*DIGIT' ||
                            'expected "%x" 1*8HEXDIG "-" 1*8HEXDIG',
                            s.slice(x).split(crlf, 1)[0], start)
                } else {
                    while (s[l] == '.') {
                        l++
                        x = l
                        while (valid(s[l])) l++;

                        if (l == x || c == 'x' && l - x > 8) helper.syntaxError(
                                c == 'b' && 'expected "%b" 1*BIT 1*("." 1*BIT)' ||
                                c == 'd' && 'expected "%d" 1*DIGIT 1*("." 1*DIGIT)' ||
                                'expected "%x" 1*8HEXDIG 1*("." 1*8HEXDIG)',
                                s.slice(x).split(crlf, 1)[0], start)
                    }
                }

                prob = collector.retrans(toTok(start, '', s.slice(i, i + 2)))
                if (prob) return prob
                i += 2
            }
        }


        if (i == l) return helper.syntaxError(
                'unexpected symbols', s.slice(i).split(crlf, 1)[0], start);

        prob = collector.retrans(toTok(start, form, s.slice(i, l)))
        if (prob) return prob
        i = l
    }

    if (defas == -1) return helper.syntaxError('unexpected empty rulelist', '<<EOF>>')

    if (right) {
        return helper.syntaxError(
            right[0] == '>' &&
            'unexpected incomplete matching angle brackets previous rule' ||
            'unexpected incomplete matching brackets previous rule', '<<EOF>>');
    }

    if (!defas || prev == '=')
        return helper.syntaxError(
            'unexpected incomplete previous rule', '<<EOF>>');

    if (')]>rnt'.indexOf(prev) == -1)
        return helper.syntaxError(
            'unexpected incremental alternatives', '<<EOF>>');

    return collector.retrans(null)
}

exports.Retrans = Retrans
exports.Trans = Trans
exports.Entries = Entries
exports.tokenize = tokenize
exports.Rules = require('./core-rules')
exports.Actions = require('./core-actions')