var ast = require('./ast');
var core = require('./core-rules');
var util = require('util');
var stream = require('stream');
var fs = require('fs');


function tokenize(string, probe) {
    // probe (string-if-probe, text, {position:[line, col]})
    //  EOF if text == null
    var i = 0,
        pos = 0,
        end = -1,
        line = 0,
        col = 0,
        crlf = (string.match(/\r\n|\n|\r/) || ['\n'])[0];

    while (end < pos) {
        end = string.indexOf(crlf, pos);
        if (end == -1) {
            end = string.length
        }
        var nowsp, text = string.slice(pos, end)
        pos = end + crlf.length
        line++
        col = 0;
        while (text) {
            var elm, c = text[i],
                s = text;

            col += i
            text = text.slice(i).trim()
            if (!i && text) {
                col += s.indexOf(text[0])
            }
            i = 0
            if (!text) break
            elm = {};
            elm.position = [line, col];
            if (i && !nowsp && c == text[0]) { // repetition *(1*c-wsp repetition)
                elm.raw = text
                if (c != ';')
                    return probe('unexpected', elm)
                i = text.length;
                if (probe(null, elm)) return;
                break
            }
            nowsp = false
            c = text[0];

            while (c >= 'a' && c <= 'z' ||
                c >= 'A' && c <= 'Z' ||
                i && (c >= '0' && c <= '9' || c == '-')) {
                i++
                c = text[i]
            }

            if (!i && c == '=') i = text[1] == '/' && 2 || 1;

            if (!i && (c == '"' || c == '%' &&
                    (text[1] == 's' || text[1] == 'i') && text[2] == '"')) {
                i = text.indexOf('"', c == '"' && 1 || 3) + 1
                if (!i) {
                    elm.raw = text
                    return probe('"', elm)
                }
                // %x20-21 / %x23-7E
            }

            if (!i && c == '<') {
                i = text.indexOf('>') + 1
                if (!i) {
                    elm.raw = text
                    return probe('>', elm)
                }
                // *(%x20-3D / %x3F-7E)
            }

            if (!i && c >= '0' && c <= '9') {
                i++
                nowsp = true
                while (text[i] >= '0' && text[i] <= '9') i++;
                if (text[i] == '*') i++;
                while (text[i] >= '0' && text[i] <= '9') i++;
            }

            if (!i && c == '*') {
                i++
                nowsp = true
                while (text[i] >= '0' && text[i] <= '9') i++;
            }

            if (!i && '[]()/'.indexOf(c) != -1) {
                nowsp = true
                i++;
            }

            if (!i && c == '%' && 'bdx'.indexOf(text[1]) != -1) {
                i = 2
                while (true) {
                    s = i
                    if (text[1] == 'b')
                        while (text[i] == '0' || text[i] == '1') i++;
                    else if (text[1] == 'd')
                        while (text[i] >= '0' && text[i] <= '9') i++;
                    else
                        while (text[i] >= '0' && text[i] <= '9' ||
                            text[i] >= 'A' && text[i] <= 'F') i++;

                    if (s == 2) {
                        elm.raw = text
                        return probe('expected num-val', elm)
                    }

                    if (s == i) break

                    s == i
                    if (text[s] != '-' && text[s] != '.') break

                    if (text[1] == 'b')
                        while (text[i] == '0' || text[i] == '1') i++;
                    else if (text[1] == 'd')
                        while (text[i] >= '0' && text[i] <= '9') i++;
                    else
                        while (text[i] >= '0' && text[i] <= '9' ||
                            text[i] >= 'A' && text[i] <= 'F') i++;

                    if (text[s] == '-') break
                }
            }

            if (!i && c == ';') i = text.length;

            if (!i) {
                elm.raw = text
                return probe('unexpected', elm)
            }
            elm.raw = text.slice(0, i)
            if (probe(null, elm)) return;
        }
    }
    probe(null, {
        position: [line, col]
    })
}

function expect(msg, line, text, filename) {
    if (msg.slice(0, 10) != 'unexpected') msg = 'expected ' + msg;
    return new Error(msg + ' ' + JSON.stringify(text), filename, line)
}

function ABNFA(string, Ast) {
    // .first      rulename
    // .rules      all rules {name: def}
    // .def        the current def {position:[line, col], name:String, alts:[]}
    // .name       the name of .def
    // .stack      the stack of construction branch
    // .comments   all comments

    this.first = null
    this.rules = {}
    this.def = null
    this.name = null
    this.stack = []
    this.comments = []
}

ABNFA.prototype.tokenize = function(elm) {
    var s = elm.raw
    if (s == null) {
        this.finish()
        return this.error
    }
    if (s[0] == ';') return this.comment(elm)

    if (s[0] >= 'a' && s[0] <= 'z' || s[0] >= 'A' && s[0] <= 'Z') {
        if (this.def) {
            if (this.def.position[1] < elm.position[1])
                return this.ref(elm)

            this.finish()
            if (this.error) return this.error
        } else if (!this.first) this.first = s
            // new
        return this.rule(elm)
    }

    if (s == '=' || s == '=/') {
        if (this.def)
            return this.fail('expected', '= | =/', elm)
        return this.rule(elm)
    }

    if (!this.def)
        return this.fail('', elm)

    if (s[0] == '(' || s[0] == ')')
        return this.group(elm);

    if (s[0] == '[' || s[0] == ']')
        return this.option(elm)

    if (s[0] == '"' || s[0] == '%' && (s[1] == 's' || s[1] == 'i'))
        return this.literal(elm);

    if (s[0] == '%') return s.indexOf('-') != -1 ?
        this.range(elm) :
        this.num(elm);

    if (s[0] == '*' || s[0] >= '0' && s[0] <= 9)
        return this.rep(elm);

    if (s == '/')
        return this.alt(elm)

    if (s[0] == '<')
        return this.prose(elm)
    return this.fail('unexpected', elm)
}

ABNFA.prototype.fail = function(msg, elm) {
    msg = msg || 'unexpected'
    this.error = this.error || expect(msg, elm.position[0], elm.raw, this.fileName)
    return this.error
}

ABNFA.prototype.push = function(elm) {
    if (this.def) this.stack.push(elm)
    return
}

ABNFA.prototype.comment = function(elm) {
    this.comments.push(elm)
}

ABNFA.prototype.ref = function(elm) {
    return this.stack.push(elm)
}

ABNFA.prototype.finish = function() {
    this.def = null
    this.name = null
    this.stack = []
}

ABNFA.prototype.get = function(name) {
    return this.rules[name || this.name]
}

ABNFA.prototype.rule = function(elm) {
    if (elm.raw[0] != '=') {
        this.name = elm.raw
        this.rules[elm.raw] = elm
        return
    }

    this.def = this.get()
    if (elm.raw == '=/') {
        if (!this.def.name)
            return this.fail(
                'unexpected Incremental Alternatives for ' + this.name, elm)

    } else if (this.def.name) {
        return this.fail('unexpected overloading for ' + this.name, elm)
    } else this.def.name = this.name
}

ABNFA.prototype.group = function group(elm) {
    if (elm.raw == '(') {
        elm.alts = [];
    }
    return this.push(elm)
}

ABNFA.prototype.option = function option(elm) {
    if (elm.raw == '[') {
        elm.alts = [];
    }
    return this.push(elm)
}

ABNFA.prototype.literal = function literal(elm) {
    elm.text = JSON.parse(elm.raw)
    this.push(elm)
}

ABNFA.prototype.range = function range(elm) {

    var first = elm.raw.split('-'),
        last = first[1];
    first = first[0]

    if (first[1] == 'd') {
        first = first.slice(2)
    } else {
        first = '0' + first.slice(1)
        last = first.slice(0, 2) + last
    }

    elm.first = Number(first)
    elm.last = Number(last)

    if (Number.isNaN(elm.first) || Number.isNaN(elm.last))
        return this.fail('unexpected NaN', elm)

    return this.push(elm)
}

ABNFA.prototype.num = function num(elm) {

    var s = elm.raw.replace.replace(/\./g, '');

    s = s[1] == 'd' && s.slice(2) || '0' + s.slice(1)
    elm.text = Number(s)

    if (Number.isNaN(elm.text))
        return this.fail('unexpected NaN', elm)

    return this.push(elm)
}

ABNFA.prototype.rep = function rep(elm) {
    var mm = elm.raw.split('*')

    if (elm.raw[0] == '*') elm.min = 0
    if (elm.raw[elm.raw.length - 1] == '*') elm.max = -1

    if (elm.min == null) elm.min = Number(mm[0])
    if (elm.max == null) elm.max = Number(mm[1])

    if (Number.isNaN(elm.min) || Number.isNaN(elm.max))
        return this.fail('unexpected NaN', elm)
    return this.push(elm)
}

ABNFA.prototype.alt = function alt(elm) {
    // Alternation
    var alts, def = last(this)
    if (elm.raw == '/') {
        if (!def) return this.fail('', elm)
        if (!def.alts) {
            this.stack.push({
                alts: [this.stack.pop(), '/']
            })
            return
        }
        if (last(def.alts) == '/') return this.fail('', elm)
        return this.push(elm)
    }
    // first Concatenation
    if (elm) {
        alts = last(this).alts
        if (!alts || alts.pop() != '/')
            return this.fail('', elm)
    }
    return this.push(elm)
}

ABNFA.prototype.prose = function(elm) {}

function last(t) {
    if (t.stack)
        return t.stack[t.stack.length - 1]
    return t[t.length - 1]
}

function parseStream(input, cb) {
    var error, bufs = [];
    input.on('data', function(chunk) {
        bufs.push(chunk);
    });
    input.on('error', function(err) {
        error = err
        cb(err, null)
    });
    input.on('end', function() {
        if (error) return
        var string = '';
        switch (bufs.length) {
            case 0:
                return;
            case 1:
                string = bufs[0].toString();
                break;
            default:
                var len = bufs.reduce(function(prev, cur) {
                    return prev + cur.length;
                }, 0);
                var buf = new Buffer(len);
                bufs.reduce(function(prev, cur) {
                    cur.copy(buf, prev);
                    return prev + cur.length;
                }, 0);
                string = buf.toString();
                break;
        }
        cb(null, string)
    });
}

exports.parseFile = function(input, cb) {
    cb = wrap(cb, input);
    fs.exists(input, function(e) {
        if (e) {
            parseStream(fs.createReadStream(input), cb);
            return
        }
        cb(new Error("File does not exist", input), null)
    })
}

function wrap(cb, fileName) {
    return function(err, string) {
        if (err) {
            return util.isFunction(cb) && cb(err, null)
        }

        var self = new ABNFA()
        self.fileName = fileName
        tokenize(string, function(probe, elm) {
            if (probe) {
                self.error = expect(probe, elm.position[0], elm.raw, fileName)
            } else {
                self.tokenize(elm)
            }
            return self.error
        })

        return !util.isFunction(cb) && self || cb(self.error, self)
    }
}

exports.ABNFA = ABNFA

exports.tokenize = tokenize

exports.parse = function(input, cb) {
    // cb (err, abnfa)
    cb = wrap(cb);
    if (input instanceof stream.Stream)
        return parseStream(input, cb);

    if (typeof(input) == "string") return cb(err, input)

    return cb(new Error("unexpected input, must be stream or string"), null)
}