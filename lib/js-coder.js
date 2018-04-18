let builder = require('./builder'),
  GC = require('./unicode-general-category'),
  // keep order
  DIRECT = ['unicode', 'fault', 'turn', 'discard', 'indent', 'eol'];

function toHex(i) {
  return '0x' + i.toString(16);
}

function sizes(sum, rune) {
  if (Number.isNaN(rune) || rune <= 0 || rune > 0x10ffff ||
      rune >= 0xD800 && rune <= 0xDFFF)
    throw Error('Invalid Unicode code point U+' + rune.toString(16));
  return sum + (rune <= 0xFFFF && 1 || 2);
}

function isDirect(i) {
  return i.refer === 'to' && DIRECT.indexOf(i.name) !== -1;
}

function func(script, comment, depth) {
  let sp = ' '.repeat(depth),
    s = !sp ? '' : ' ' + sp;
  return `function (b) {${comment ? ' // ' + comment : ''}
    ${sp}return ${script};
  ${s}}`;
}

function repeat(min, max) {
  if (min === 1 && max === 1)  return 'b.Once(';
  if (min === 1 && max === -1) return 'b.More(';
  if (min === 0 && max === -1) return 'b.Any(';
  if (min === 0 && max === 1)  return 'b.Option(';
  return `b.Repeat(${min},${max},`;
}

function string(args) {
  return JSON.stringify(args).slice(1, -1);
}

class Coder {
  constructor(meta) {
    this.bud = builder(meta);
    this._ = meta.mode === 'string' && '_' || '$';
    this.m = meta;
    this.turns = [];
    this.forms = new Array(meta.formulas.length).fill('');
    this.flags = new Array(meta.formulas.length).fill(0);
    this.redirect = [];
    this.firstAction = 0;
    meta.formulas.forEach(function(e, i) {
      if (e.type === 'action')
        this.firstAction = this.firstAction || i;
      else if (i !== this.redirect.length)
        throw Error('Metadata must be patternize first');
      else {
        this.redirect.push(i);
        this.flags[i] = this[e.type + '_flag'](e);
      }
    }, this);

    let c = 1;
    while (c) {
      c = 0;
      for (let i = 0; i < this.firstAction; i++) {
        let e = meta.formulas[i];
        if (!this.flags[i]) {
          this.flags[i] = this[e.type + '_flag'](e);
          c += this.flags[i];
        }
      }
    }

    for (let i = 0; i < this.forms.length; i++) {
      this.walk(i);
    }
  }

  gen(method, args) {
    let fn = this.bud[method];
    if (typeof fn !== 'function')
      throw Error(`Builder dons not have ${method} in ${this.m.mode} mode`);
    if (typeof args === 'string')
      return `b.${method}(${args})`;
    if (fn.length && args.length > fn.length)
      throw Error(`Excess parameters on ${method} in ${this.m.mode} mode`);
    return `b.${method}(${string(args)})`;
  }

  bits_flag(e) {
    return 0;
  }

  action_flag(e) {
    throw Error('Meta must be patternize first');
  }

  string_flag(e) {
    return 0;
  }

  codes_flag(e) {
    return 0;
  }

  index_flag(e) {
    if (e.min !== 1 || e.max !== 1) return 0;
    return e.refer && this.flags[e.refer] || 0;
  }

  list_flag(e) {
    if (e.min !== 1 || e.max !== 1) return 0;
    return !e.choice && 1 ||
      e.factor.some(function(e) {
        if (e.min !== 1 || e.max !== 1) return false;
        return this[e.type + '_flag'](e) === 1;
      }, this) && 1 || 0;
  }

  next(e) {
    if (e.type === 'list')
      e.factor.forEach(this.next, this);
    else if (e.type === 'index')
      this.walk(e.refer).walk(e.action);
  }

  walk(i) {
    if (!this.forms[i]) {
      let e = this.m.formulas[i];
      this.forms[i] = this[e.type + this._ + 'code'](e, 0);
      this.next(e);
    }
    return this;
  }

  list$code(e, depth) {
    return this.list_code(e, depth);
  }

  list_code(e, depth) {
    let
      sep = e.choice && ' ||' || ' &&',
      a = e.factor.map(function(e) {
        return this[e.type + this._ + 'code'](e, depth + 1);
      }, this),
      script = a[0],
      sp = ' '.repeat(depth),
      c = script.length;
    for (var i = 1; i < a.length; i++) {
      c += a[i].length + 4;
      if (c <= 60)
        script += sep + ' ' + a[i];
      else {
        script += sep + '\n    ' + sp + a[i];
        c = 6 + depth + a[i].length;
      }
    }
    script = e.choice && `(${script})` || script;
    if (e.choice && isOnce(e)) return script;
    //if (depth === 0 && isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  string$code(e, depth) {
    return string_code(e, depth);
  }
  string_code(e, depth) {
    let
      x = e.sensitive && e.value || e.value.toLowerCase(),
      script = this.gen(
        (e.sensitive || x === x.toUpperCase()) &&
        'EatString' || 'EatIString',
        [x, x.length]
      );
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  bits$code(e, depth) {
    let x = e.value,
      script = this.gen('EatBits', `0b${x},${x.length}`);
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  bits_code(e, depth) {
    throw Error('Unsupported bits in string mode');
  }

  codes$code(e, depth) {
    let
      script = !e.isRange &&
      this.gen('EatBytes', e.value.map(toHex).join(',')) ||
      this.gen('EatRangeByte', e.value.map(toHex).join(','));

    if (!e.value.every(function(x) {return x >= 0 && x <= 255;}))
      throw Error('Unsupported codes.value greater than 0xFF in byte mode');

    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  codes_code(e, depth) {
    let
      script = !e.isRange &&
      this.gen('EatString', [
        e.value.reduce(function(s, x) {
          return s + String.fromCodePoint(x);
        }, ''),
        e.value.length
      ]) ||
      this.gen(
        e.value.reduce(sizes, 0) === 2 && 'EatRangeChar' || 'EatRangeRune',
        e.value.map(toHex).join(',')
      );
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  indent(at) {
    if (at && ['>>','>1','>=','==','<=','<1','<<'].indexOf(at) < 0)
      throw Error(
        `Unsupported parameters on to--indent('${at}')`
      );
    return at || '>>';
  }

  unicode(args) {
    // if (this._ === '$')
    //   throw Error(`Unsupported to--unicode in byte mode`);

    // if (args.some(function(c) {return GC.indexOf(c) === -1;}))
    //   throw Error(
    //     `Unsupported category on to--unicode(${string(args)})`
    //   );
    return '/^(\\p{' + args.join('}|\\p{') + '})/u';
  }

  turn(args) {
    let
      x = this.m.formnames.indexOf(args[0]),
      y = this.m.formnames.indexOf(args[1] || args[0]);

    if (x <= 0 || y <= 0 ||
      x >= this.redirect.length ||
      y >= this.redirect.length)
      throw Error(
        `Invalid rulename on to--turn(${string(args)}).`
      );

    if (x === y)
      this.turns = this.turns.filter(function(x) {
        return x !== this;
      }, x);
    else if (this.turns.indexOf(x) !== -1)
      throw Error(
        `Unsupported to--turn(${string(args)}) again.`
      );

    this.redirect[x] = y;
    return [x,y];
  }

  action$code(e) {
    if (e.refer === 'to' && e.name === 'unicode')
      throw Error(
        'Unsupported to--unicode in byte mode.'
      );
    return this.action_code(e, 1);
  }
  action_code(e, depth) {
    if (isDirect(e)) return this.gen(
      'direct_' + e.name,
      e.name === 'unicode' && this.unicode(e.factor) ||
      e.name === 'indent'  &&  this.indent(e.factor[0]) ||
      e.name === 'turn' && this.turn(e.factor) ||
      e.factor
    );

    let id = e.refer === 'to' && -1 ||
      this.m.typenames.indexOf(e.name),
      args = e.factor && e.factor.slice()||[],
      decl = id !== -1 && this.m.types[id];

    if (decl && decl.kind !== 'struct' &&
        (!decl.annotation || !decl.annotation.length)
      )
      throw Error(`Invalid type on refer--${e.name}`);

    if (id === -1 && !depth && e.name === 'BYTES' && (
      args.length < 2 || !args[1]))
      throw Error(
        `Missing decoding method on refer--BYTES(${string(args)})`
      );

    if (e.refer === 'to') {
      if (e.name === 'type') {
        if (!args.length || !args[0]) throw Error(
          `Missing type name on to--type(${string(args)})`
        );
        id = this.m.typenames.indexOf(args[0]);
        if (id !== -1) {
          if (this.m.types[id].kind !== 'struct')
            throw Error(`Invalid type on to--type('${args[0]}')`);
          return this.gen('to_type', [id]);
        }

        if (typeof this.bud['refer_' + args[0]] !== 'function')
          throw Error(`Invalid to--type(${string(args)})`);

        return this.gen('to_type', [args[0]]);
      }

      if (e.name === 'move' || e.name === 'copy') {
        if (args.length !== 2)
          throw Error(`Invalid to--${e.name}(${string(args)})`);
      }
    }

    return id === -1 &&
      this.gen(`${e.refer}_${e.name}`, args) ||
      this.gen('meta', [id, args[0]]);
  }

  form(e, x, y) {
    x = x < this.firstAction ? this.redirect[x] : x;
    return !y && !this.flags[x] && isOnce(e) &&
      `form[${x}](b)` ||
      repeat(e.min, e.max) + `form[${x}],${y})`;
  }

  index$code(e, depth) {
    return this.index_code(e, depth);
  }
  index_code(e, depth) {
    let
      script,
      action = this.m.formulas[e.action],
      i = e.refer && -1 ||
        DIRECT.indexOf(action.name);

    if (e.min < 0 || e.min > e.max && e.max >= 0)
      throw Error(`Bad repeat ${e.min}*${e.max}`);

    if (i !== -1) {
      if (i < 4 && (e.min !== 1 || e.max !== 1))
        throw Error(invalid(e, this.m));
      return this.form(e, e.action, 0);
    }

    if (e.refer) return this.form(e, e.refer, e.action);

    if (e.min > e.max) throw Error(invalid(e, this.m));

    script = this.gen(
      'Pin',
      [
        action.refer === 'to' && action.name === 'type' &&
        -e.action || e.action
      ]
    );

    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ' ,0)';
  }
}

function isOnce(e) {
  return e.min === 1 && e.max === 1;
}

function invalid(e, m) {
  return `Invalid ${e.min}*${e.max}${m.formnames[e.action]}`;
}

module.exports = function(meta) {
  let
    conf,
    types = meta.types,
    typenames = meta.typenames,
    formulas = meta.formulas,
    coder = new Coder(meta),
    builer = coder.bud,
    script = coder.forms.map(function(script, i) {
      return func(script, `${i}: ${this[i]}`, 0);
    }, meta.formnames).join(',\n  '),
    mixins = [],
    spread = [],
    annoIndex = function(annotation, a, nesting) {
      annotation.forEach((k) => {
        let i = spread.indexOf(k);
        if (i === -1) {
          i = typenames.indexOf(k);
          if (i === -1) {
            if (a.indexOf(k) === -1) {
              if (k !== 'BOOL' && !builer['refer_' + k])
                throw Error(`Unsupported ${k} type`);
              a.push(k);
            }
          }else if (a.indexOf(i) === -1)
            a.push(i);
          return;
        }
        if (nesting) throw Error('Unsupported nesting spread');
        annoIndex(types[typenames.indexOf(k)].annotation, a, true);
      });
    };

  meta = {
    mode: meta.mode,
    typefield: meta.typefield,
    locfield: meta.locfield,
    crlf: meta.crlf,
    indent: meta.indent,
    infix: meta.infix || null,
    custom: meta.custom || null,
    nullable: meta.nullable || null,
    typenames: meta.typenames,
    types: meta.types,
    formnames: meta.formnames
  };

  meta.types = types.map((t, i) => {
    if (!t.kind || t.kind === 'interface') {
      // interface and enmu
      spread.push(typenames[i]);
    }

    if (!t.fields)
      return {kind: t.kind,annotation:t.annotation.slice()};

    let decl =  {kind: t.kind, fields: Object.create(null)};
    for (let k in t.fields) {
      let field = t.fields[k];
      if (decl.fields[k]) throw Error(
        `Duplicate ${typenames[i]}.${k} definitions`
        );

      if (field.kind !== 'mixins') {
        decl.fields[k] = {
          kind: field.kind,
          value: field.value === undefined?'':field.value,
          annotation: field.annotation || null,
        };
        continue;
      }

      if (mixins.indexOf(k) === -1) mixins.push(k);

      let
        idx = typenames.indexOf(k),
        mix = types[idx];
      if (!mix || mix.kind !== 'struct')
        throw Error(`Invalid kind of mixins ${k}`);

      for (let key in mix.fields) {
        let field = mix.fields[key];
        if (decl.fields[key]) throw Error(
          `Duplicate ${typenames[i]}.${key} definitions through mixins ${k}`
          );
         decl.fields[key] = {
          kind: field.kind,
          value: field.value === undefined?'':field.value,
          annotation: field.annotation || null,
        };
      }
    }
    return decl;
  }).map((t) => {
    if (t.kind === 'interface' || !t.kind) return t;

    if (t.annotation && t.annotation.length) {
      let annotation = [];
      annoIndex(t.annotation, annotation);
      return {kind: t.kind,annotation: annotation};
    }

    for (let k in t.fields) {
      let decl = t.fields[k];
      if (!decl.annotation || !decl.annotation.length) continue;
      let annotation = [];
      annoIndex(decl.annotation, annotation);
      t.fields[k] = {
        kind: decl.kind,
        value: decl.value || '',
        annotation: annotation
      };
    }
    return t;
  });

  conf = JSON.stringify(meta, null, '  ');

  return `// Generated by abnfa/lib/coder-js
module.exports = ${conf};
let form = module.exports.formulas = [
  ${script}
];
`;
};
