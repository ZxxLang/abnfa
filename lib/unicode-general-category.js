// http://www.unicode.org/Public/UCD/latest/ucd/PropertyValueAliases.txt
// # General_Category (gc)
module.exports = [
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
