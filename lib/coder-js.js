let builder = require('./builder').prototype,
  DIRECT = ['fault','turn', 'discard', 'indent', 'unicode', 'eol'],
  // http://www.unicode.org/Public/UCD/latest/ucd/PropertyValueAliases.txt
  // # General_Category (gc)
  GC = [
    'C',  'Other',                  // Cc | Cf | Cn | Co | Cs
    'Cc', 'Control', 'cntrl',
    'Cf', 'Format',
    'Cn', 'Unassigned',
    'Co', 'Private_Use',
    'Cs', 'Surrogate',
    'L',  'Letter',                 // Ll | Lm | Lo | Lt | Lu
    'LC', 'Cased_Letter',           // Ll | Lt | Lu
    'Ll', 'Lowercase_Letter',
    'Lm', 'Modifier_Letter',
    'Lo', 'Other_Letter',
    'Lt', 'Titlecase_Letter',
    'Lu', 'Uppercase_Letter',
    'M',  'Mark', 'Combining_Mark', // Mc | Me | Mn
    'Mc', 'Spacing_Mark',
    'Me', 'Enclosing_Mark',
    'Mn', 'Nonspacing_Mark',
    'N',  'Number',                 // Nd | Nl | No
    'Nd', 'Decimal_Number', 'digit',
    'Nl', 'Letter_Number',
    'No', 'Other_Number',
    'P',  'Punctuation', 'punct',   // Pc | Pd | Pe | Pf | Pi | Po | Ps
    'Pc', 'Connector_Punctuation',
    'Pd', 'Dash_Punctuation',
    'Pe', 'Close_Punctuation',
    'Pf', 'Final_Punctuation',
    'Pi', 'Initial_Punctuation',
    'Po', 'Other_Punctuation',
    'Ps', 'Open_Punctuation',
    'S',  'Symbol',                 // Sc | Sk | Sm | So
    'Sc', 'Currency_Symbol',
    'Sk', 'Modifier_Symbol',
    'Sm', 'Math_Symbol',
    'So', 'Other_Symbol',
    'Z',  'Separator',              // Zl | Zp | Zs
    'Zl', 'Line_Separator',
    'Zp', 'Paragraph_Separator',
    'Zs', 'Space_Separator'
  ];

function toHex(i) {
  return '0x' + i.toString(16);
}

function first(s) {
  return s.codePointAt(0);
}

function sizes(sum, rune) {
  if (isNaN(rune) || rune <= 0 || rune > 0x10ffff ||
      rune >= 0xD800 && rune <= 0xDFFF)
    throw Error('Invalid rune: U+' + rune.toString(16));
  return sum + (rune <= 0xFFFF && 1 || 2);
}

function genCall(method, args) {
  let fn = builder[method];
  if (typeof fn !== 'function')
    throw Error(`The builder has not method: ${method}`);
  if (typeof args === 'string')
    return `b.${method}(${args})`;
  if (fn.length && args.length > fn.length)
    throw Error(`Excess parameters on method: ${method}`);
  return `b.${method}(${string(args)})`;
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

function fmt(obj) {
  return JSON.stringify(obj, null, '  ');
}

function string(args) {
  return JSON.stringify(args).slice(1, -1);
}

class Coder {
  constructor(meta) {
    if (meta.mode !== 'string')
      throw Error(`Unimplemented ${meta.mode} mode`);

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
        throw Error('Must be patternize first');
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

  bits_flag(e) {
    throw Error('Unimplemented bits mode');
  }

  action_flag(e) {
    throw Error('Must be patternize first');
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
      this.forms[i] = this[e.type + '_code'](e, 0);
      this.next(e);
    }
    return this;
  }

  list_code(e, depth) {
    let
      sep = e.choice && ' ||' || ' &&',
      a = e.factor.map(function(e) {
        return this[e.type + '_code'](e, depth + 1);
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
    if (depth === 0) return script;
    script = e.choice && `(${script})` || script;
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  string_code(e, depth) {
    let
      x = e.sensitive && e.value || e.value.toLowerCase(),
      script = genCall(
        (e.sensitive || x === x.toUpperCase()) &&
        'EatString' || 'EatIString',
        [x, x.length]
      );
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  bits_code(e) {
    throw Error('Unimplemented bits mode');
  }

  codes_code(e, depth) {
    let
      v = e.value,
      script = !e.isRange &&
      genCall('EatString', [
        v.reduce(function(s, x) {
          return s + String.fromCodePoint(x);}
        ),
        v.length
      ]) ||
      genCall(
        v.reduce(sizes, 0) === 2 && 'EatRangeChar' || 'EatRangeRune',
        v.map(toHex).join(',')
      );
    if (isOnce(e)) return script;
    return repeat(e.min, e.max) + func(script, '', depth) + ', 0)';
  }

  indent(at) {
    at = at || '>';
    if (['>','>1','>=','==','<=','<1','<'].indexOf(at) < 0)
      throw Error(
        `Unsupported argument on to--indent('${at}')`
      );
    return at;
  }

  unicode(args) {
    if (args.some(function(c) {return GC.indexOf(c) === -1;}))
      throw Error(
        `Unsupported category on to--unicode(${string(args)})`
      );
    return '/\\p{' + args.join('}|\\p{') + '}/u';
  }

  turn(args) {
    let
      x = this.m.formnames.indexOf(args[0]),
      y = this.m.formnames.indexOf(args[1] || args[0]);

    if (x <= 0 || y <= 0 ||
      x >= this.redirect.length ||
      y >= this.redirect.length)
      throw Error(
        `Undefined rule on to--turn(${string(args)})`
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

  action_code(e) {
    if (isDirect(e)) return genCall(
      e.name,
      e.name === 'unicode' && this.unicode(e.factor) ||
      e.name === 'indent'  &&  this.indent(e.factor[0]) ||
      e.name === 'turn' && this.turn(e.factor) ||
      e.factor
    );

    let id = e.refer === 'to' && -1 ||
      this.m.typenames.indexOf(e.name);

    return id === -1 &&
      genCall(`${e.refer}_${e.name}`, e.factor) ||
      genCall('Create', [id].concat(e.factor));
  }

  form(e, x, y) {
    x = this.redirect[x];
    return !y && !this.flags[x] && isOnce(e) &&
      `b.Form(${x})` ||
      repeat(e.min, e.max) + `b.Form(${x}),${y})`;
  }

  index_code(e, depth) {
    let
      script,
      i = e.refer && -1 ||
        DIRECT.indexOf(this.m.formulas[e.action].name);

    if (e.min < 0 || e.min > e.max && e.max >= 0)
      throw Error(`Bad repeat ${e.min}*${e.max}`);

    if (i !== -1) {
      if (i < 4 && (e.min !== 1 || e.max !== 1))
        throw Error(invalid(e, this.m));
      return this.form(e, e.action, 0);
    }

    if (!e.action) return this.form(e, e.refer, 0);

    if (e.refer) return this.form(e, e.refer, e.action);

    if (e.min > e.max) throw Error(invalid(e, this.m));

    script = genCall('Pin', [e.action]);

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

module.exports = function(metadata) {

  if (metadata.mode !== 'string' && metadata.mode !== 'byte')
    throw Error('Unsupported mode: ' + metadata.mode);
  let dist = new Coder(metadata);

  return `// Generated by abnfa/lib/coder-js.js
exports.mode = ${fmt(metadata.mode)};
exports.typefield = ${fmt(metadata.typefield)};
exports.locfield = ${fmt(metadata.locfield)};
exports.crlf = ${fmt(metadata.crlf)};
exports.indent = ${fmt(metadata.indent)};
exports.infix = ${fmt(metadata.infix)};
exports.custom = ${fmt(metadata.custom)};
exports.typenames = ${fmt(metadata.typenames)};
exports.types = ${fmt(metadata.types)};
exports.formnames = ${fmt(metadata.formnames)};
exports.formulas = [
  ` +
  dist.forms.map(function(script, i) {
    return func(script, `${i}: ${this[i]}`, 0);
  }, metadata.formnames).join(',\n  ') +
`
];
`;
};
