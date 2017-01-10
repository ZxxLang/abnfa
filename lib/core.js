"use strict"
var helper = require('./helper'),
    Rules = require('./core-rules');

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
    return c >= 0x20 && c <= 0x7E || c == 0x09
}

function string(c) {
    //  STRING   = *(%x20-21 / %x23-7E)
    return c >= 0x20 && c <= 0x7E && c != 0x22
}

function prose(c) {
    //  PROSE    = *(%x20-3D / %x3F-7E)
    return c >= 0x20 && c <= 0x7E && c != 0x3E
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
    if (form == 'crlf') {
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

        var r, list = []
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
    //         [c-nl ...]           tokens of un-rule
    //         [rulename, c-nl ...] tokens of a rule
    //         null                 on <<EOF>>
    this.entries = []
}

Entries.prototype.retrans = function retrans(tokens) {
    var i, j, rule;
    if (null == tokens) return this.entries

    for (i = 0; i < tokens.length;) {
        rule = null;
        for (j = i; j < tokens.length; j++)
            if (tokens[j].form == 'rulename') {
                rule = tokens[j]
                break
            }

        i != j && this.entries.push(tokens.slice(i, j))
        if (!rule) break

        i = j
        for (j++; j < tokens.length; j++)
            if (tokens[j].start.col <= rule.start.col &&
                ['wsp', 'crlf'].indexOf(tokens[j].form) == -1) break

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
    // formal       raw
    // ''           '('
    // ''           ')'
    // ''           '/'
    // ''           '['
    // ''           ']'
    // ''           '"'
    // ''           '<'
    // ''           '>'
    // ''           '%s'
    // ''           '%i'
    // ''           '%b'
    // ''           '%d'
    // ''           '%x'
    // '='          "=" / "=/"
    // 'wsp'        1*(1*%x09 / 1*%x20)
    // 'crlf'       (%x0D %x0A) / %x0D / %x0A ; crlf / cr / lf
    // 'b'          1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]
    // 'd'          1*DIGIT [ 1*("." 1*DIGIT) / ("-" 1*DIGIT) ]
    // 'x'          1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]
    // 'string'     *(%x20-7E) ; quoted string or prose string
    // 's'          *(%x20-7E) ; %s string
    // 'i'          *(%x20-7E) ; %i string
    // 'repeat'     1*HEXDIG / (*HEXDIG "*" *HEXDIG)
    // 'comment'    ";" *(WSP / VCHAR)
    // 'rulename'   ALPHA *(ALPHA / DIGIT / "-")
    var prob, i = s.search(/\r\n|\n|\r/),
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

    var l, form, c, valid;
    i = 0
    while (i < s.length) {
        l = i
        form = ''
        c = s[i]
        if (c == ' ' || c == '\t') {
            l++
            form = 'wsp'
            while (s[l] == ' ' || s[l] == '\t') l++
        } else if (c == '\r' || c == '\n') {
            form = 'crlf'
            l += crlf.length
                // if (s.slice(i, l) != crlf)
                //     return helper.syntaxError('unexpected symbols', s.slice(i, l), start)
        } else if (c == ';') {
            form = 'comment'
            l++
            while (vchar(s.charCodeAt(l))) l++;
        } else if (alpha(c)) {
            form = 'rulename'
            if (start.col <= rcol || defas == -1) {

                if (right) return helper.syntaxError(
                    'unexpected incomplete matching brackets previous rule',
                    s.slice(i).split(crlf, 1)[0], start);

                if (!defas || ')]rnt'.indexOf(prev) == -1)
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
            while (alpha(s[l]) || digit(s[l]) || s[l] == '-') l++;
        } else if (start.col <= rcol) {
            return helper.syntaxError(
                'unexpected symbols', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '/') {
            if (start.col <= rcol || ')]rnt'.indexOf(prev) == -1) return helper.syntaxError(
                'unexpected incremental alternatives',
                s.slice(i).split(crlf, 1)[0], start);

            prev = c
            l++
        } else if (')]'.indexOf(c) != -1) {

            if (c != right[0]) return helper.syntaxError(
                'unexpected incomplete matching brackets previous rule',
                s.slice(i).split(crlf, 1)[0], start);

            right = right.slice(1)
            prev = c
            l++
        } else if (c == '(') {
            right = ')' + right
            prev = c
            l++
        } else if (c == '[') {
            right = ']' + right
            prev = c
            l++
        } else if (c == '*' || digit(c)) {
            prev = '*'
            form = 'repeat'
            l++
            while (digit(s[l])) l++;
            if (c != '*' && s[l] == '*') {
                l++
                while (digit(s[l])) l++;
            }
            c = s[l]
            if (!alpha(c) && '(%"<'.indexOf(c) == -1)
                return helper.syntaxError(
                    'unexpected symbols after repeat', s.slice(i).split(crlf, 1)[0], start);

        } else if (c == '"' || c == '<') {
            prev = 't'
            l++
            valid = c == '"' && string || prose
            while (valid(s.charCodeAt(l))) l++;
            if (c == '"' && s[l] != c || c == '<' && s[l] != '>')
                return helper.syntaxError(
                    c == '"' && 'expected DQUOTE *(%x20-21 / %x23-7E) DQUOTE' ||
                    'expected prose "<" *(%x20-3D / %x3F-7E) ">"',
                    s.slice(i).split(crlf, 1)[0], start);

            prob = collector.retrans(toTok(start, '', c)) ||
                collector.retrans(toTok(start, 'string', s.slice(i + 1, l))) ||
                collector.retrans(toTok(start, '', c == '"' && '"' || '>'))

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
                if (!valid(s[l])) return helper.syntaxError(
                    c == 'b' && 'expected "%b" 1*BIT [ 1*("." 1*BIT) / ("-" 1*BIT) ]' ||
                    c == 'd' && 'expected "%d" 1*DIGIT [ 1*("." 1*DIGIT) / ("-" 1*DIGIT) ]' ||
                    'expected "%x" 1*HEXDIG [ 1*("." 1*HEXDIG) / ("-" 1*HEXDIG) ]',
                    s.slice(i).split(crlf, 1)[0], start)

                while (valid(s[l])) l++;

                if (s[l] == '-') {
                    l++
                    if (!valid(s[l])) helper.syntaxError(
                        c == 'b' && 'expected "%b" 1*BIT "-" 1*BIT' ||
                        c == 'd' && 'expected "%d" 1*DIGIT "-" 1*DIGIT' ||
                        'expected "%x" 1*HEXDIG "-" 1*HEXDIG',
                        s.slice(i).split(crlf, 1)[0], start)

                    while (valid(s[l])) l++;

                } else {
                    while (s[l] == '.') {
                        l++
                        if (!valid(s[l])) helper.syntaxError(
                            c == 'b' && 'expected "%b" 1*BIT 1*("." 1*BIT)' ||
                            c == 'd' && 'expected "%d" 1*DIGIT 1*("." 1*DIGIT)' ||
                            'expected "%x" 1*HEXDIG 1*("." 1*HEXDIG)',
                            s.slice(i).split(crlf, 1)[0], start)

                        while (valid(s[l])) l++;
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
            'unexpected incomplete matching brackets previous rule', '<<EOF>>');
    }

    if (!defas || prev == '=')
        return helper.syntaxError(
            'unexpected incomplete previous rule', '<<EOF>>');

    if (')]rnt'.indexOf(prev) == -1)
        return helper.syntaxError(
            'unexpected incremental alternatives', '<<EOF>>');

    return collector.retrans(null)
}

exports.Retrans = Retrans
exports.Trans = Trans
exports.Entries = Entries
exports.tokenize = tokenize
exports.Rules = Rules