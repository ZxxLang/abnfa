let
  MIN_INT = Number.MIN_SAFE_INTEGER,
  MAX_INT = Number.MAX_SAFE_INTEGER,
  decoder = require('./decoder'),
  INT_FAMILY = [
    'INT',
    'I8',
    'I16',
    'I32',
    'I64',
    'I128',
    'U8',
    'U16',
    'U32',
    'U64',
    'U128',
    'UINT',
    'RUNE'
  ],
  FLOAT_FAMILY = ['FLOAT','F32','F64','F128','F256'];

function fmt(o) {
  return JSON.stringify(o);
}

function has(bare, property){
  return Object.hasOwnProperty.call(bare, property);
}

function extend(dist, object) {
  for(let name in object) {
    if(has(dist, name)) throw Error(`Duplicate property ${name}`);
    dist[name] = object[name];
  }
  return true;
}

function allowed(parentDecl, childKind) {
  return !parentDecl.annotation ||
    !parentDecl.annotation.length ||
    parentDecl.annotation.indexOf(childKind) !== -1;
}

function assert(actual, expect) {
  if (actual !== expect)
    throw Error(`Expected ${expect}, but got ${actual}`);
}

function overflow(min, max, a) {
  if (a[2] < min || a[2] > max)
    throw Error(`Overflow ${a[0]} range ${min}..${max}: ${a[2]}`);
}

function bare() {
  return Object.create(null);
}

function b2s(bytes) {
  return bytes.reduce(function(s, u) {
    return s + s.constructor.fromCharCode(u);
  }, '');
}

class Builder {
  constructor(coder, ext_decoder) {
    this.coder = coder;
    this.decoder = Object.assign(bare(), decoder);

    if ('[object Object]' === Object.prototype.toString.call(ext_decoder)) {
      for (let t in ext_decoder) {
        if (!this.decoder.hasOwnProperty(t)) continue;
        let set = ext_decoder[t];
        for (let name in set) {
          if (typeof set[name] === 'function')
            this.decoder[t][name] = set[name];
        }
      }
    }
  }

  _init(source) {
    this.crlf = '';
    this.indent = this.coder.indent;
    this.forms = this.coder.formulas;
    this.decls = this.coder.types;
    this.types = this.coder.typenames;
    this.locfield = this.coder.locfield;
    this.typefield = this.coder.typefield;

    this.bols = [[0,0,0]]; // offset, runes, indent
    this.bits = 0;
    this.runes = 0;
    this.offset = 0;
    this.length = 0;
    this.record = [];
    this.stack = [];
    this.sibling = [];
    this.pending = 0;
    this.src = source;
    this.srcLength = source.length;
  }

  isNothing() {
    return this.length === 0;
  }

  isPartial() {
    return this.offset !== this.srcLength;
  }

  safeInt(x) {
    if (!Number.isInteger(x) || x < MIN_INT || x > MAX_INT)
      throw Error('Unsafe INTEGER value: ' + x);
    return x;
  }

  parse(source) {
    this.init(source);

    if (!this.forms[0](this)) {
      let
        last = this.stack.pop(),
        pos = last && last[4] || 0,
        at = (pos - this.offset) || 0 ;
      this.direct_fault('Unknown reasons failed and fallback: %q', at);
    }

    if (this.isPartial())
      throw Error(`Incomplete parse. ${this.offset}/${this.srcLength}`);

    return this;
  }

  create(typeIndex, recordIndex) {
    let decl = this.decls[typeIndex];
    if(decl.kind === 'struct') {
      let
        n = bare();
      if (this.typefield)
        n[this.typefield] = this.types[typeIndex];
      if (this.locfield)
        n[this.locfield] = this.locate(this.record[recordIndex]);
      return n;
    }

    if (decl.kind === 'ARRAY' || decl.kind === 'UNIQUE')
      return [];
    if (decl.kind === 'OBJECT')
      return bare();
    throw Error('Internal error, invalid type: '+JSON.stringify(decl));
  }

  replay(idx) {
    this.idx = idx;
    let
      record = this.record[idx],
      item = this.forms[record[0]](this);

    if (item) item.record = record;
    return item;
  }

  build() {
    let
      idx = this.length - 1,
      item = this.replay(idx);

    this.resolve(item);
    if (this.stack.length) throw Error('Stack is not empty');
    return item[2];
  }

  resolve(item) {
    let
      indexes = [],
      begin = item.record[1],
      end = item.record.idx,
      sibling = this.sibling;

    this.sibling = [];
    this.stack.push(item);
    while (begin < end) {
      let record = this.record[--end];
      if (record[0] >= 0)
        indexes.push(end);
      else if (item.length === 2) {
        // process to--type
        this.idx = item.record.idx;
        this.forms[-record[0]](this);
      } else
        throw Error('Unexpected to--type');
      end = record[1];
    }

    // move and copy steps
    indexes.reverse().forEach((idx) => {
      let sibling = this.replay(idx);
      if (sibling) this.sibling.push(sibling);
    });

    let
      decl = item.decl || item[0],
      keys = 'OBJECT' === (decl.kind || decl) && [] || null,
      vals = keys && [] || null,
      parent = item[2];

    this.sibling.forEach((sibling) => {
      this.resolve(sibling);
      let
        kind = sibling[0],
        name = sibling[1],
        prefix = name[0],
        child = sibling[2];

      if (prefix === '/') {
        let item = this.stack[0];
        name = name.slice(1);
        if (item.decl && item.decl.fields &&
            this.assignify(kind, name, child, item.decl, item[2]))
          return;
      }else if (prefix === '?') {
        let i = this.stack.length;
        name = name.slice(1);
        while (i--) {
          let item = this.stack[i];
          if (item.decl && item.decl.fields &&
              this.assignify(kind, name, child, item.decl, item[2]))
            return;
        }
      } else if (keys) {
        if (name === 'key') {
          if (kind !== 'STRING')
            throw Error('Expected STRING key for OBJECT');
          if (has(parent, child) || keys.indexOf(child)!==-1)
            throw Error(`Duplicate property ${child} for OBJECT`);
          keys.push(child);
        }else if (name === 'val') {
          if (!allowed(decl, kind))
            throw Error(`Unexpected ${kind} val for OBJECT`);
          vals.push(child);
        } else
          throw Error(`Unexpected field ${name} for OBJECT`);
        let i = keys.length - vals.length;
        if(i>1 || i<-1) {
          let miss = i > 1 && 'val' || 'key';
          throw Error(`Missing ${miss} for OBJECT`);
        }
        return;
      } else if (this.assignify(kind, name, child, decl, parent))
        return;

      throw Error('Assign child failed ' + JSON.stringify([item, sibling],null,'  '));
    });

    this.sibling = sibling;
    this.stack.pop();

    if (keys) {
      let i = keys.length - vals.length;
      if(i>0 || i<0) {
        let miss = i > 0 && 'val' || 'key';
        throw Error(`Missing ${miss} for OBJECT`);
      }
      keys.forEach((key, i) => {
        parent[key] = vals[i];
      });
    }else if (item.decl && item.decl.fields) {
      // Default value of field
      let
        node = item[2],
        fields = item.decl.fields;
      for (let name in fields)
        if (!has(node,name)) {
        let field = fields[name];
        if (['INT','STRING','BOOL'].indexOf(field.kind) !== -1)
          node[name] = field.value;
      }
    }
  }

  assignify(kind, field, child, decl, parent) {
    // struct
    if (decl.fields) {
      if (!field || !has(decl.fields, field)) return false;
      decl = decl.fields[field];

      if(!decl.kind) {
        if(-1 === decl.annotation.indexOf(kind)) throw Error(
          `Invalid ${kind} for ${field} <${decl.annotation.join(',')}>`
        );

        if (has(parent, field))
          throw Error(`Duplicate ${field} <${kind}>`);
        parent[field] = child;
        return true;
      }

      if (decl.kind === kind) {
        if (!has(parent, field)) {
          parent[field] = child;
          return true;
        }

        if (kind === 'OBJECT')
          return extend(parent[field], child);

        throw Error(`Duplicate field '${field}' within ${kind}`);
      }

      if (!decl.annotation || decl.kind !== 'ARRAY' && decl.kind !== 'UNIQUE')
        throw Error(`Never accept field ${field} to ${fmt(decl)}`);

      if (!has(parent, field)) parent[field] = [];
      parent = parent[field];
    }

    // elements
    if ('ARRAY' === (decl.kind || decl)) {
      if (!allowed(decl, kind)) throw Error(
          `Invalid ${kind} for ARRAY<${decl.annotation.join(',')}>`
        );

      parent.push(child);
      return true;
    }

    if ('UNIQUE' === (decl.kind || decl)) {
      if (!allowed(decl, kind)) throw Error(
          `Invalid ${kind} for UNIQUE<${decl.annotation.join(',')}>`
        );

      if (
          -1 === ['STRING','BOOL'].indexOf(kind) &&
          -1 === FLOAT_FAMILY.indexOf(kind) &&
          -1 === INT_FAMILY.indexOf(kind)
        ) throw Error(
          `Invalid ${kind} for UNIQUE<${decl.annotation.join(',')}`
        );

      if (-1 !== parent.indexOf(child))
        throw Error(`Duplicate element value ${child} in UNIQUE`);
      parent.push(child);
      return true;
    }

    throw Error(`Invalid parent kind '${decl.kind || decl}'`);
  }

  Pin(index) {
    return this.save(this.points(index));
  }

  // repeat(form)

  Any(form, pin) {
    let c = 0,points = this.points(pin);
    while (this.Once(form, 0)) c++;
    if (!c) this.rollback(points);
    return pin && this.save(points) || true;
  }

  More(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    while (this.Once(form, 0));
    return pin && this.save(points) || true;
  }

  Once(form, pin) {
    let points = this.points(pin);
    if (!form(this)) return this.rollback(points);
    return pin && this.save(points) || true;
  }

  Option(form, pin) {
    let points = this.points(pin);
    if (!form(this))
      return this.rollback(points) || true;
    // Contract behavior, keep   ^^^^^^^
    return pin && this.save(points) || true;
  }

  Repeat(min, max, form, pin) {
    let c = 0, points = this.points(pin);
    while (c !== max && this.Once(form, 0)) c++;
    if (c < min) return this.rollback(points);
    return pin && this.save(points) || true;
  }

  // match methods

  EatString(stringOrBytes, columns) {
    if (!this.StartsWith(stringOrBytes, this.offset))
      return false;
    this.offset += stringOrBytes.length;
    this.runes += columns;
    return true;
  }

  EatIString(lowerCaseStringOrBytes, columns) {
    if (!this.IStartsWith(lowerCaseStringOrBytes, this.offset))
      return false;
    this.offset += lowerCaseStringOrBytes.length;
    this.runes += columns;
    return true;
  }

  EatRangeChar(begin, last) {
    let x = this.UintAt(this.offset);
    if (!(x >= begin && x <= last))
      return false;
    this.offset++;
    this.runes++;
    return true;
  }

  EatRangeRune(begin, last) {
    let x = this.UintAt(this.offset);
    if (!(x >= begin && x <= last))
      return false;

    this.offset += x > 0xFFFF && 2 || 1;
    this.runes++;
    return true;
  }

  // actions with Pin

  getDecode(type, method) {
    let fn = this.decoder[type] && this.decoder[type][method];

    if (!fn) throw Error(`Missing decoder.${type}.${method}`);
    return fn;
  }

  refer_INT(field, decode) {
    return this.decode('INT', field, decode || '10');
  }

  refer_I8(field, decode) {
    return overflow(-0x80, 0x7F,
      this.decode('INT', field, decode || '10', 'I8'));
  }
  refer_I16(field, decode) {
    return overflow(-0x8000, 0x7FFF,
      this.decode('INT', field, decode || '10', 'I16'));
  }
  refer_I32(field, decode) {
    return overflow(-0x80000000, 0x7FFFFFFF,
      this.decode('INT', field, decode || '10', 'I32'));
  }

  refer_I64(field, decode) {
    return this.decode('INT', field, decode || '10', 'I64');
  }

  refer_BYTE(field, decode) {
    return overflow(0, 0xFF,
      this.decode('INT', field, decode || '10', 'BYTE'));
  }
  refer_U8(field, decode) {
    return overflow(0, 0xFF,
      this.decode('INT', field, decode || '10', 'U8'));
  }
  refer_U16(field, decode) {
    return overflow(0, 0xFFFF,
      this.decode('INT', field, decode || '10', 'U16'));
  }

  refer_U32(field, decode) {
    return overflow(0, 0xFFFFFFFF,
      this.decode('INT', field, decode || '10', 'U32'));
  }

  refer_U64(field, decode) {
    return overflow(0, MAX_INT,
      this.decode('INT', field, decode || '10', 'U64'));
  }

  refer_RUNE(field, decode) {
    let
      a = this.decode('INT', field, decode || '16', 'RUNE'),
      x = a[2];

    if (x < 0 || x > 0x10FFFF || (x >= 0xD800 && x <= 0xDFFF))
      throw Error(
        'Unsafe Unicode code point : U+' + x.toString(16).toUpperCase()
      );
    return a;
  }

  refer_FLOAT(field, decode, INTfirst) {
    let
      item = this.decode('FLOAT', field, decode || 'string'),
      x = INTfirst && Math.floor(item[2]) || 0;
    if (INTfirst && (x >= MIN_INT && x <= MAX_INT) && x === Math.ceil(item[2])) {
      item[0] = 'INT';
      item[2] = x;
    }
    return item;
  }

  refer_F32(field, decode) {
    return this.decode('FLOAT', field, decode || 'string', 'F32');
  }
  refer_F64(field, decode) {
    return this.decode('FLOAT', field, decode || 'string', 'F64');
  }
  refer_F128(field, decode) {
    return this.decode('FLOAT', field, decode || 'string', 'F128');
  }
  refer_F256(field, decode) {
    return this.decode('FLOAT', field, decode || 'string', 'F256');
  }

  refer_STRING(field, decode, concat) {
    let item = this.decode('STRING', field, decode || 'echo');
    return this.to_STRING(field||'', item[2], concat);
  }

  refer_TIME(field, decode) {
    return this.decode('TIME', field, decode || 'ISO8601');
  }

  refer_BYTES(field, decode) {
    return this.decode('BYTES', field, decode || 'echo');
  }

  refer_ARRAY(field) {
    return ['ARRAY', field, []];
  }
  refer_UNIQUE(field) {
    return ['UNIQUE', field, []];
  }
  refer_OBJECT(field) {
    return ['OBJECT', field, bare()];
  }

  meta(typeIndex, field) {
    let item = [typeIndex, field, this.create(typeIndex, this.idx)];
    item.decl = this.decls[typeIndex];
    return item;
  }

  refer_pending(field) {
    return [null, field];
  }

  to_type(typeOrIndex) {
    let
      meta = typeof typeOrIndex === 'number',
      parent = this.stack.length &&
        this.stack[this.stack.length - 1];

    if (!parent || parent.length !== 2 || parent[0] !== null) {
      let name = meta && this.types[typeOrIndex] || typeOrIndex;
      throw Error(`Missing pending on to--type('${name}'`);
    }

    parent[0] = typeOrIndex;

    if (meta) {
      parent.decl = this.decls[typeOrIndex];
      parent.push(this.create(typeOrIndex, this.idx));
    } else {
      parent.push(this['refer_' + typeOrIndex].call(this, parent[1])[2]);
    }

    return null;
  }

  to_INT(field, v) {
    return ['INT', field, this.safeInt(v)];
  }

  to_RUNE(field, v) {
    return ['RUNE', field, decoder.RUNE['16'](this, v)];
  }

  to_FLOAT(field, v) {
    return ['FLOAT', field, decoder.FLOAT.string(this, v)];
  }

  to_STRING(field, v, concat) {
    field = field||'';
    if (concat) {
      // suffix prefix
      let i = this.sibling.length;
      while (i--) {
        if (this.sibling[i][1] !== field) continue;
        if (this.sibling[i][0] !=='STRING')
          throw Error('Expected STRING type for connection');
        if(concat === 'suffix') {
          this.sibling[i][2] += v;
          return null;
        }
        if(concat === 'prefix') {
          this.sibling[i][2] = v+this.sibling[i][2];
          return null;
        }
        break;
      }
      if (concat !== 'suffix' && concat !== 'prefix')
        throw Error(`Unsupported ${concat} connection mode`);
    }

    return ['STRING', field, v || ''];
  }

  to_move(field, dist) {
    let
      i = this.sibling.length;
    field = field || '';
    while (i--) {
      if (this.sibling[i][1] === field)
        this.sibling[i][1] = dist||'';
    }
    return null;
  }

  to_copy(field, dist) {
    let
      i = this.sibling.length;
    field = field||'';
    while (i--) {
      if (this.sibling[i][1] === field) {
        let item = this.sibling[i].slice();
        item[1] = dist||'';
        return item;
      }
    }
    throw Error(
      `No sibling to--copy('${field}','${dist}')`
    );
  }

  to_null(field) {
    return ['null', field, null];
  }

  to_true(field) {
    return ['BOOL', field, true];
  }

  to_false(field) {
    return ['BOOL', field, false];
  }

  to_Infinity(field, negative) {
    return ['FLOAT', field, negative ? -Infinity : Infinity];
  }

  to_NaN(field, negative) {
    return ['FLOAT', field, NaN];
  }

  // direct actions

  direct_turn(optimized, always_returns_true) {
    return true;
  }

  direct_fault(message, key) {
    let at = key || 0;
    if (typeof at === 'number')
      at = this.offset + at;
    else {
      let
        i = this.length,
        s = '("' + key + '"',
        names = this.coder.formnames;
      while (i) {
        let points = this.record[--i];
        if (points[0]<0 || names[points[0]].indexOf(s) === -1){
          i = points[1];
          continue;
        }
        at = points[2];
        i = -1;
        break;
      }
      if (i !== -1) {
        message = JSON.stringify(message);
        throw Error(`to--fault(${message}, ${key}), and no given field found.`);
      }
    }

    let s = '';
    if (this.coder.mode === 'string') {
      let i = this.src.indexOf(this.crlf || '\n', at);
      if (i !== -1) {
        if (i > 80 + at || i < at + 20) i = at + 20;
        s = this.src.substring(at, i);
      }else {
        for (i = 0; i < 20 && i < this.src.length - at; i++) {
          if (this.UintAt(i + at) > 0xFFFF) i++;
        }
        s = this.src.substring(at, at + i);
      }
    }else {
      s += '[';
      for (let i = 0; i < 8 && i < this.src.length - at; i++) {
        s += (i && ',0x' || '0x') + this.src[i + at].toString(16);
      }
      s += ']';
    }

    let i = message.indexOf('%q');

    if (i === -1) {
      i = message.indexOf('%s');
      if (i === -1) i = message.length;
    }else {
      s = JSON.stringify(s);
    }

    throw Error(
      message.substring(0, i) + s + message.substring(i + 2)
    );
  }

  direct_eol() {
    if (this.crlf) {
      if (!this.StartsWith(this.crlf, this.offset))
        return false;
    }else {
      let x = this.UintAt(this.offset);
      if (x === 10)
        this.crlf = '\n';
      else if (x === 13)
        this.crlf = this.UintAt(this.offset + 1) === 10 &&
          '\r\n' || '\r';
      else
        return false;
    }

    this.runes += this.crlf.length;
    this.offset += this.crlf.length;

    let last = this.bols.length - 1;
    if (this.bols[last][0] < this.offset) {
      this.bols.push([this.offset, this.runes, 0]);
    }
    return true;
  }

  direct_indent(how) {
    // '>>','>1','>=','==','<=','<1','<<'
    if (!this.tab) {
      let c = this.UintAt(this.offset);
      if (c === 0x20)
        this.tab = ' ';
      else if (c === 0x09)
        this.tab = '\t';
      else
        return false;
    }

    let
      last = this.bols.length - 1,
      c = last ? -this.bols[last - 1][2] : 0;

    while (this.StartsWith(this.tab, this.offset)) c++;

    if (!last && !c) return false;
    switch (how) {
      case '>>':
        if (c <= 0) return false;
        break;
      case '>1':
        if (c !== 1) return false;
        break;
      case '>=':
        if (c < 0) return false;
        break;
      case '==':
        if (c !== 0) return false;
        break;
      case '<=':
        if (c > 0) return false;
        break;
      case '<1':
        if (c !== -1) return false;
        break;
      case '<<':
        if (c >= 0) return false;
        break;
      default:
        return false;
    }

    this.runes += this.tab.length;
    this.offset += this.tab.length;

    this.bols[last][2] = c;
    return true;
  }

  direct_discard() {
    if (this.length) {
      this.length--;
      return true;
    }

    throw Error(
      'No savepoints no to--discard'
    );

    // Born in this world
    // I say it's no money no love
    // No money no love
    // Yeah yeah yeah

    // Dead in the code
    // I say it's no coding no dead
    // No throw no Error
    // No if no then
    // No while no break
    // Yeah yeah yeah
  }

}

class String extends Builder {
  decode(type, field, method, T) {
    let
      fn = this.getDecode(type, method);

    if (fn.length === 2)
      return [T || type, field, fn(this, this.data(this.idx))];
    throw Error(`Incorrect parameters on decoder.${type}.${method} in string mode`);
  }

  init(source) {
    if (typeof source !== 'string')
        throw Error('Expected String source in string mode');
    this._init(source);
  }

  // core-scanner methods in string mode

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

  locate(points) {
    return {
      start: {
        line: points[2],
        cloumn: 0
      },
      end: {
        line: points[4],
        cloumn: 0
      }
    };
  }

  points(pin) {
    return [pin, this.length,this.offset, this.runes];
  }

  save(points) {
    points.push(this.offset, this.runes);
    points.idx = this.length;
    if (this.length === this.record.length)
      this.record.push(points);
    else
      this.record[this.length] = points;
    this.length++;
    return true;
  }

  rollback(points) {
    this.length = points[1];
    this.offset = points[2];
    this.runes = points[3];
    return false;
  }

  data() {
    let points = this.record[this.idx];
    return this.src.substring(points[2], points[4]);
  }
}

class Byte extends Builder {
  init(source) {
    if (!Array.isArray(source) && !(source instanceof Uint8Array))
        throw Error('Expected Uint8Array source in byte mode');
    this._init(source);
  }

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

  locate(points) {
    return {
      start: points[2],
      end: points[4]
    };
  }

  points(pin) {
    return [pin, this.length, this.offset, this.runes];
  }

  save(points) {
    points.push(this.offset, this.runes);
    points.idx = this.length;
    if (this.length === this.record.length)
      this.record.push(points);
    else
      this.record[this.length] = points;
    this.length++;
    return true;
  }

  rollback(points) {
    this.length = points[1];
    this.offset = points[2];
    this.runes = points[3];
    return false;
  }

  data() {
    let points = this.record[this.idx];
    return this.src.substring(points[2], points[4]);
  }

  direct_unicode(regexp) {
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

  decode(type, field, method, T) {
    let
      fn = this.getDecode(type, method);

    if (fn.length === 2)
      return [T || type, field, fn(this, b2s(this.data(this.idx)))];

    return [T || type, field, fn(this, this.data(this.idx))];
  }
}

class Bits extends Builder {
  decode(type, field, method, T) {
    let
      fn = this.getDecode(type, method);

    if (fn.length === 2)
      return [T || type, field, fn(this, b2s(this.data(this.idx)))];

    return [T || type, field, fn(this, this.data(this.idx))];
  }

  init(source) {
    if (!Array.isArray(source) && !(source instanceof Uint8Array))
        throw Error('Expected Uint8Array source in bits mode');
    this._init(source);
  }

  UintAt(offset) {
    if (this.bits || offset >= this.srcLength) return NaN;
    return this.src[offset];
  }

  StartsWith(bytes, offset) {
    let j = 0,end = bytes.length + offset;
    if (this.bits || end > this.srcLength) return false;

    for (let i = offset; i < end; i++)
      if (bytes[j++] !== this.src[i]) return false;

    return true;
  }

  IStartsWith(bytes, offset) {
    let j = 0, end = bytes.length + offset;
    if (this.bits || end > this.srcLength) return false;

    for (let i = offset; i < end; i++) {
      let x = bytes[j++], y = this.src[i];
      if (x !== y && (y < 65 || y > 90 || x !== y | 0x20))
        return false;
    }

    return true;
  }

  EatBits(x, bitsLength) {
    // |   8bits     | *byte | 8bits    |
    // | bits + head |  body | tail ... |
    let
      i = 0,
      tail =  (bitsLength +  this.bits) % 8,
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

    this.bits = this.bits + head + tail % 8;
    this.offset = last + (!this.bits && 1 || 0);
    return true;
  }

  locate(points) {
    return {
      start: points[2],
      end: points[4]
    };
  }

  points(pin) {
    return [pin, this.length, this.offset, this.bits];
  }

  save(points) {
    points.push(this.offset, this.bits);
    points.idx = this.length;
    if (this.length === this.record.length)
      this.record.push(points);
    else
      this.record[this.length] = points;
    this.length++;
    return true;
  }

  rollback(points) {
    this.length = points[1];
    this.offset = points[2];
    this.bits = points[3];
    return false;
  }

  data(index) {
    // Align to the right
    let
      points = this.record[index],
      left = points[3],
      right = points[5],
      bytes = this.src.slice(points[2], points[4]);

    if (!bytes.length || !left && !right)
      return bytes;

    if (bytes.length === 1) {
      bytes[0] = (bytes[0] & (0xFF >> left)) >> (8 - right);
      return bytes;
    }

    if (!right) {
      bytes[0] = bytes[0] & (0xFF >> left);
      return bytes;
    }

    let
      i = bytes.length - 1,
      x = bytes[i],
      h = bytes[i - 1];

    bytes[0] = bytes[0] & 0xFF >> 8 - left;

    while (i) {
      bytes[i--] = (0xFF & h << right) | (x >> (8 - right));
      x = h;
      if (i) h = bytes[i - 1];
    }
    bytes[0] = x >> right;
    if (left + right <= 8) return bytes.slice(1);
    return bytes;
  }
}

module.exports = function(coder, extended_decoder) {
  if (coder.mode === 'string')
    return new String(coder, extended_decoder); // jshint ignore:line
  if (coder.mode === 'byte')
    return new Byte(coder, extended_decoder);
  if (coder.mode === 'bits')
    return new Bits(coder, extended_decoder);
  throw Error(`Unsupported ${coder.mode} mode`);
};
