// Built-in decoder

let decoder = {
  INT: {
    '2': function(b, s) {
      return b.safeInt(parseInt(s, 2));
    },
    '8': function(b, s) {
      return b.safeInt(parseInt(s, 8));
    },
    '10': function(b, s) {
      return b.safeInt(parseInt(s, 10));
    },
    '16': function(b, s) {
      return b.safeInt(parseInt(s, 16));
    },
    LE: function(b, bytes, _) {

    },
    BE: function(b, bytes, _) {

    },
    ME: function(b, bytes, _) {

    }
  },
  FLOAT: {
    string: function(b, s) {
      let x = parseFloat(s);
      if (Number.isNaN(x) || x === -Infinity || x === Infinity)
        throw Error('Unsafe FLOAT value: ' + s);
      return x;
    },
    binary: function(b, bytes, _) {
      throw Error('Unimplement IEEE 754 floating-point data base 2 (binary)');
    },
    decimal: function(b, bytes, _) {
      throw Error('Unimplement IEEE 754 floating-point data base 10 (decimal)');
    }
  },
  STRING: {
    echo: function(b, s) {
      return s;
    },
    unescape: function(b, s) {
      // \ ' " / b f n r t u
      return JSON.parse('"' + s + '"');
    },
    trim: function(b, s) {
      return s.trim();
    }
  },
  TIME: {
    ISO8601: function(b, s) {
      return new Date(s);
    }
  },
  BYTES: {
    echo: function(b, bytes, _) {
      return bytes;
    }
  }
};

module.exports = decoder;
