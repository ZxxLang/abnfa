let decoder = require('./decoder');

let
  MIN_INT = Number.MIN_SAFE_INTEGER,
  MAX_INT = Number.MAX_SAFE_INTEGER,
  iota    = 1,

  ROOT    = iota++,
  MAKE    = iota++,
  AKV     = iota++,
  INT     = iota++,

  NEVER   = iota++,

  CONST   = iota++,
  COPY    = iota++,
  RENAME  = iota++,
  TYPE    = iota++,
  REWRITE = iota++,
  ERROR   = iota++,
  NL      = iota++,
  INDENT  = iota++,
  UNICODE = iota++;

/**
 * Builder
 */
class Builder {
  constructor(MetaCoder) {
    this.config = MetaCoder.config;
    this.types = MetaCoder.types;
    this.pattern = MetaCoder.pattern;
  }

  parse(source) {
    this.error = '';
    this.source = source;
    this.offset = 0;
    this.runes = 0;
    this.indent = 0;
    this.crlf = '';
    this.bols  = [[0,0,0]]; // offset, runes, indent
    this.savepoint = [];

    // Matching stage
    this.stack = [[0,0,0,0,TO_STRING]];
    this.length = 1;

    if (!this.pattern[1](this)) return false;
    if (this.offset < this.source.length)
      return this.to_error('incomplete ' + this.offset);

    // Create fields and build node stage
    let childs = this.stack.slice(0, this.length);
    this.stack = [];
    this.type = '';
    if (!this.replay(childs)) {
      if (!this.error)
        this.error = 'Oop';
      return false;
    }
    return true;
  }

  stepCodePoint(rune) {
    if (rune < 0x10000) {
      this.offset++;
      this.runes++;
    }else {
      this.offset += 2;
      this.runes++;
    }
    return true;
  }

  getString() {
    return this.source.substring(this.start, this.end);
  }

  replay(childs) {
    // [start, end, pattern, length, action]
    let a, i = 0;
    this.fields = [];
    while (i < childs.length) {
      a = childs[i];
      i += a[3] + 1;
      if (a[4] <= REF_NODE) continue;

      this.start = a[0];
      this.end = a[1];
      if (!this.pattern[a[2]](this)) return false;
    }

    if (!this.type)
      return this.to_error('missing type');

    let
      parent = null,
      node = Object.create(null);
    node[this.config.typeField] = this.type;
    this.result = node;
    this.createFields(this.types[this.type]);
    this.stack.push(node);

    if (!this.fields.every(function(field) {
      return this.assignField(this.result, field);
    }, this))
      return false;

    i = 0;
    while (i < childs.length) {
      a = childs[i++];
      this.type = '';
      if (a[4] > REF_NODE) continue;
      let field =  this.pattern[a[2]](this);
      this.start = a[0];
      this.end = a[1];
      if (a[3] && !this.replay(childs.slice(i, i + a[3])))
        return false;
      switch (a[4]){
        case REF_NODE:
          parent = node;
          break;
        case REF_ROOT:
          parent = this.stack[0];
          break;
        case REF_CLOSEST:
          let j = this.stack.length;
          while (j) {
            j--;
            if (this.stack[j].hasOwnProperty(field)) {
              parent = this.stack[j];
              break;
            }
          }
          break;
      }
      if (!parent)
        return this.to_error('missing field for closest: ' + field);
      this.assignField(parent, {
        name: field,
        value: this.result,
        start: a[0],
        end: a[1]
      });
      i += a[3];
    }
    this.result = this.stack.pop();
    return true;
  }

  postField(name, value) {
    this.fields.push({name, value, start: this.start, end: this.end});
  }

  createFields(fields) {
    fields.forEach(function(field) {
      if (field.type === 'mixin') {
        this.createFields(this.types[field.annotation]);
        return;
      }

      this.result[field.name] = field.type === 'array' && [] ||
        field.type === 'node' && Object.create(null) ||
        field.value;
    }, this);
  }

  Create(typeIndex, toFieldName) {

  }

  assignField(parent, field) {
    let val = parent[field.name];
    if (Array.isArray(val))
      val.push(field.value);
    else if (typeof field.value === typeof val)
      parent[field.name] = field.value;
    else {
      if (!this.error)
        console.log(parent, field, this.source.substring(0, field.end));
      return this.to_error(
        'unexpected type of ' + field.name + ': ' +
        typeof field.value
        );
    }
    return true;
  }

  HasError() {
    return !!this.error;
  }

  Push() {
    if (this.error) return false;
    this.savepoint.push([
      this.offset,
      this.runes,
      this.length,
      this.bols.length
    ]);
    return true;
  }

  Pop(ok) {
    if (this.error) return false;
    let s = this.savepoint.pop();
    if (!ok) {
      this.offset = s[0];
      this.runes = s[1];
      this.length = s[2];
      while (s[3] !== this.bols.length)
        this.bols.pop();
    }
    return ok;
  }

  Root(field, type) {
    this.type = type;
    return field;
  }

  Make(field, type) {
    this.postField(field,
      insensitive ? this.getString().toUpperCase() : this.getString()
    );
    return true;
  }

  PeekCodePoint(offset) {
    return this.source.codePointAt(offset);
  }

  PeekCharCode(offset) {
    return this.source.charCodeAt(offset);
  }

  points(index) {
    return [this.offset, this.runes, this.length, index];
  }

  savepoints(points) {
    if (this.length === this.savepoint.length)
      this.savepoint.push(points);
    else
      this.savepoint[this.length] = points;
    this.length++;
    return true;
  }

  rollback(points) {
    this.offset = points[0];
    this.runes = points[1];
    this.length = points[2];
    return false;
  }

  Pin(index) {
    return this.savepoints(this.points(index));
  }

  Form(index) {
    return this.formulas[index];
  }

  // repeat(form)

  Any(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points) || true;
    while (form(this));
    return pin && this.savepoints(points) || true;
  }

  More(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    while (form(this));
    return pin && this.savepoints(points) || true;
  }

  Once(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    return pin && this.savepoints(points) || true;
  }

  Option(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points) || true;
    return pin && this.savepoints(points) || true;
  }

  Repeat(min, max, form, pin) {
    let c = 0, points = this.points(pin);
    while (c !== max && form(this)) c++;
    if (c < min) return this.rollback(points);
    return pin && this.savepoints(points) || true;
  }

  // match methods

  EatString(string, columns) {
    if (!this.source.startsWith(string, this.offset))
      return false;
    this.offset += string.length;
    this.runes += columns;
    return true;
  }

  EatIString(lowerCaseString, columns) {
    let s = this.source.substring(this.offset, lowerCaseString.length);
    if (s.toLowerCase() !== lowerCaseString) return false;

    this.offset += lowerCaseString.length;
    this.runes += columns;
    return true;
  }

  EatRangeChar(min, max) {
    let x = this.PeekCharCode(this.offset);
    if (x < min || x > max) return false;
    this.offset++;
    this.runes++;
    return true;
  }

  EatRangeRune(min, max) {
    let x = this.PeekCodePoint(this.offset);
    if (x < min || x > max) return false;
    this.offset += x > 0xFFFF && 2 || 1;
    this.runes++;
    return true;
  }

  // actions with Pin

  refer_INT(field, decode) {
    let
      i = decoder.INT[decode || '10'](s);
    if (isNaN(i) || i < MIN_INT || i > MAX_INT)
      throw Error('Unsafe INT string: ' + s);
  }

  refer_RUNE(field, decode) {
    let
      rune = decoder.RUNE[decode || ''](s);
    if (isNaN(rune) || rune < 0 || rune > 0x10ffff ||
        rune >= 0xD800 && rune <= 0xDFFF)
      throw Error('Invalid RUNE string: ' + s);
  }

  refer_FLOAT(field, decode) {

  }

  refer_STRING(field, decode) {

  }
  refer_TIME(field) {

  }
  refer_BYTES(field) {

  }
  refer_ARRAY(field) {

  }
  refer_UNIQUE(field) {

  }
  refer_OBJECT(field) {

  }
  refer_MAP(field) {

  }
  refer_PROPERTY(field) {

  }

  refer_pending(field) {

  }

  to_INT(field, v) {

  }

  to_RUNE(field, v) {

  }

  to_FLOAT(field, v) {

  }

  to_STRING(field, v) {

  }

  to_type(name) {
    this.postField(this.config.typeField, name);
    return true;
  }

  to_copy(field, dist) {
    if (this.fields.some(function(f) {
      if (f.name !== field) return false;
      this.postField(dist, f.value);
      return true;
    }, this)) return true;

    this.to_error(`missing field: to--copy--${field}--${dist}`);
    return false;
  }

  to_rename(field, name) {
    for (var i = this.fields.length - 1; i >= 0; i--) {
      if (this.fields[i].name === field) {
        this.fields[i].name = name;
        return true;
      }
    }
    this.To_error(`missing field: to--rename--${field}--${name}`);
    return false;
  }

  to_true(field) {
  }

  to_false(field) {
  }

  to_null(field) {
  }

  to_Infinity(field, negative) {

  }

  // direct actions

  discard() {

  }

  turn(optimized, always_returns_true) {
    return true;
  }

  fault(message, at) {
    return false;
  }

  eol() {
    if (this.crlf) {
      if (!this.EatString(this.crlf, this.crlf.length))
        return false;
    }else if (this.EatChar('\n', 1)) {
      this.crlf = '\n';
    }else if (this.EatString('\r\n', 2)) {
      this.crlf = '\r\n';
    }else if (this.EatChar('\r', 1)) {
      this.crlf = '\r';
    }else
      return false;

    let len = this.bols.length;
    if (!len || this.bols[len - 1][0] < this.offset) {
      this.bols.push([this.offset, this.runes, 0]);
    }
    return true;
  }

  indent(offset) {
    let bol = this.bols[this.bols.length - 1];
    this.indent++;
    bol[2] = this.indent;
    return true;
  }

  unicode(regexp) {
    let m = this.source.substring(this.offset).match(regexp);
    if (!m || m.index !== 0) return false;
    let end = m[0].length + this.offset;
    while (this.offset !== end)
      this.stepCodePoint(codePoint());
    return true;
  }

}

module.exports = Builder;
