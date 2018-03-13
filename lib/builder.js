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
  constructor(coder, extended_decoder) {
    this.coder = coder;
    this.decoder = decoder || null;
  }

  decode(type, method) {
    if (!this.decoder || !this.decoder[type] ||
      !this.decoder[type][method])
      return decoder[type][method](this.data);

    return this.decoder[type][method](this.data);
  }

  parse(source) {
    this.error = '';
    this.offset = 0;
    this.runes = 0;
    this.indent = 0;
    this.crlf = '';
    this.bols  = [[0,0,0]]; // offset, runes, indent
    this.savepoints = [];

    this.exHigh = 0; // Extra high
    this.src = source;

    if (this.coder.bytes) {
      if (!Array.isArray(source) && !(source instanceof Uint8Array))
        throw Error('Expected Uint8Array source for byte mode');
    }else if (typeof source !== 'string')
        throw Error('Expected String source for string mode');

    this.srcLength = source.length;
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

  Pin(index) {
    return this.save(this.points(index));
  }

  Form(index) {
    return this.formulas[index];
  }

  // repeat(form)

  Any(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points) || true;
    while (form(this));
    return pin && this.save(points) || true;
  }

  More(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    while (form(this));
    return pin && this.save(points) || true;
  }

  Once(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    return pin && this.save(points) || true;
  }

  Option(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points) || true;
    return pin && this.save(points) || true;
  }

  Repeat(min, max, form, pin) {
    let c = 0, points = this.points(pin);
    while (c !== max && form(this)) c++;
    if (c < min) return this.rollback(points);
    return pin && this.save(points) || true;
  }

  // match methods

  EatString(stringOrBytes, columns) {
    if (this.exHigh || !this.StartsWith(stringOrBytes, this.offset))
      return false;
    this.offset += stringOrBytes.length;
    this.runes += columns;
    return true;
  }

  EatIString(lowerCaseStringOrBytes, columns) {
    if (this.exHigh || !this.IStartsWith(lowerCaseStringOrBytes, this.offset))
      return false;
    this.offset += lowerCaseStringOrBytes.length;
    this.runes += columns;
    return true;
  }

  EatRangeChar(begin, last) {
    let x = this.UintAt(this.offset);
    if (this.exHigh || !(x >= begin && x <= last))
      return false;
    this.offset++;
    this.runes++;
    return true;
  }

  EatRangeRune(begin, last) {
    let x = this.UintAt(this.offset);
    if (this.exHigh || !(x >= begin && x <= last))
      return false;

    this.offset += x > 0xFFFF && 2 || 1;
    this.runes++;
    return true;
  }

  EatBits(x, bitsLength) {
    // |   8bits     | *byte | 8bits    |
    // | exHigh+head |  body | tail ... |
    let
      i = 0,
      tail =  (bitsLength +  this.exHigh) % 8,
      head = (bitsLength - tail) % 8,
      body = bitsLength - tail - head,
      last = this.offset;

    body = body - body % 8 >> 3;
    // last index
    last += (head && 1 || 0) + body + (tail && 1 || 0) - 1;

    if (last >= this.srcLength) return false;

    i = last;
    if (tail) {
      if (x & (0xFF >> 8 - tail) !== this.UintAt(i--) >> 8 - tail)
        return false;
      x = x >> tail;
    }

    while (body) {
      if (x & 0xFF !== this.UintAt(i--)) return false;
      x = x >> 8;
      body--;
    }

    if (head && x !== this.UintAt(i) >> 8 - head)
      return false;

    this.exHigh = this.exHigh + head + tail % 8;
    this.offset = last + (!this.exHigh && 1 || 0);
    return true;
  }


  // actions with Pin

  refer_INT(field, decode) {
    let x = this.decode('INT', decode || 10);
    if (Number.isNaN(x) || x < MIN_INT || x > MAX_INT)
      throw Error('Unsafe INT value: ' + x);
  }

  refer_RUNE(field, decode) {
    let x = this.decode('RUNE', decode || 16);
    if (Number.isNaN(x) || x < 0 || x > 0x10ffff ||
        x >= 0xD800 && x <= 0xDFFF)
      throw Error('Invalid RUNE value: ' + x);
  }

  refer_FLOAT(field, decode) {
    let x = this.decode('FLOAT', decode || 'string');
  }

  refer_STRING(field, decode) {
    let x = this.decode('STRING', decode || 'string');
    if (field && field[0] === '+') {
      let v = this.fieldValue(field.slice(0));
    }
  }

  refer_TIME(field, decode) {
    let x = this.decode('TIME', decode || 'ISO8601');
  }

  refer_BYTES(field, decode) {
    throw Error('Unimplemented refer--BYTES');
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
    for (let i = this.fields.length - 1; i >= 0; i--) {
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

  turn(optimized, always_returns_true) {
    return true;
  }

  fault(message, at) {
    at = at || 0;
    if (typeof at === 'string') {

    }

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
    let m = this.src.substring(this.offset).match(regexp),
      s = m && m[0] || '';
    if (!m || m.index !== 0) return false;
    this.offset += s.length;
    this.runes += s.length;
    for (let i = 0; i < s.length; i++) {
      if (s.codePointAt(i) > 0xFFFF) {
        i++;
        this.runes--;
      }
    }
    return true;
  }

  discard() {
    if(!this.length)
      throw Error('Unable to discard, the save points is empty');
    this.length--;
  }

  // core-scanner methods for string mode

  save(points) {
    if (this.length === this.savepoints.length)
      this.savepoints.push(points);
    else
      this.savepoints[this.length] = points;
    this.length++;
    return true;
  }

  UintAt(offset) {
    return this.src.codePointAt(offset);
  }

  StartsWith(string, offset) {
    return this.src.startsWith(string, offset);
  }

  IStartsWith(string, offset) {
    return string === this.src.substring(offset, offset + string.length)
      .toLowerCase();
  }

  points(index) {
    return [this.offset, this.runes, this.length, index];
  }

  rollback(points) {
    this.offset = points[0];
    this.runes = points[1];
    this.length = points[2];
    return false;
  }

}

class Creator extends Builder {

  // core-scanner methods for byte mode

  UintAt(offset) {
    if (offset >= this.srcLength) return NaN;
    return this.src[offset];
  }

  StartsWith(bytes, offset) {
    let j = 0,end = bytes.length + offset;
    if (end > this.srcLength) return false;

    for (let i = offset; i < end; i++)
      if (bytes[j++] !== this.src[i]) return false;

    return true;
  }

  IStartsWith(bytes, offset) {
    let j = 0, end = bytes.length + offset;
    if (end > this.srcLength) return false;

    for (let i = offset; i < end; i++) {
      let x = bytes[j++], y = this.src[i];
      if (x !== y && (y < 65 || y > 90 || x !== y | 0x20))
        return false;
    }

    return true;
  }

  save(points) {
    points[1] = (points[1] << 8) + this.exHigh;
    if (this.length === this.savepoints.length)
      this.savepoints.push(points);
    else
      this.savepoints[this.length] = points;
    this.length++;
    return true;
  }

  points(index) {
    return [this.offset, this.exHigh, this.length, index];
  }

  rollback(points) {
    this.offset = points[0];
    this.exHigh = points[1];
    this.length = points[2];
    return false;
  }

}

module.exports = function(coder, extended_decoder) {
  return coder.bytes &&
    new Creator(coder, extended_decoder) ||
    new Builder(coder, extended_decoder);
};
