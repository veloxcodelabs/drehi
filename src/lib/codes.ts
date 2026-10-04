export const VALID_INVITE_CODES: readonly string[] = [
  'test',
  'bekoda', 'concept166', 'cvetnov', 'erectedstore', 'faithinfatih', 'ignisatelier',
  'mariaqueenmaria', 'milshop', 'sassabjorg', 'studioibis', 'stylyne', 'veza',
  'veze', 'ambitsia', 'bg0511', 'antonella', 'bebeshore', 'behaviourswimwea',
  'byjgk', 'coolsouls', 'diplus', 'knapp', 'lbd', 'lorreti', 'palomafashion',
  'romantikafashion', 'selfishstyledesi', 'abellafashion', 'atelierengele', 'avenew',
  'boutiquecocoon', 'codemoda', 'denicaboutique', 'elissima', 'ephosbg', 'exfashion',
  'exclusivejeans', 'margonia', 'nelita', 'radichev', 'rudi', 'rumella',
  'sevibysevdalina', 'siskahandknit7', 'soulsinclothes', 'tarikuti', 'vamped',
  'vianswimwear', 'vikonte', 'vulgarista', 'whatamonstar', 'vezba', 'vilistil',
  'ethnobuldesign', 'stilnajena', 'tedy13', 'caviarcouture', 'plus0concept',
  'gioiafashionstor', 'ivatex', 'perfectlingerie', 'signorafashion', 'moncher',
  'nolli', 'bogariaatelier', 'paolastyle', 'tianabg', 'vladimirkaraleev', 'renystyle',
  'bohosi', 'aakasha', 'marikris', 'tyapti', 'slineshop', 'bonojeans', 'tuzar',
  'benmodel', 'styler', 'lazarini', 'pironetic', 'smfit', 'junona', 'loreen',
  'exza', 'alessa', 'lucy', 'lily', 'vivamoda', 'christine', 'sensdunoir', 'lovate',
  'inisessshop', 'yasha', 'veteida', 'iventishirts', 'maxifashion', 'cliche',
  'jenistyle', 'luximabg', 'pausejeansonline', 'ikstylee', 'aletaparizi', 'emem',
  'inobg', 'limonibg', 'maisontangerine', 'twelveoclock', 'mareamoda', 'animafashion',
  'sirenaplus', 'krass', 'misschic', 'ladonna', 'stelaruse', 'daphne', 'caramellaonline',
  'vitalityaw', 'alert', 'randeva', 'lucil', 'richtex', 'renifashion', 'startsport',
  'avinonline', '1inmind', 'geronimo', 'pierreshirts', 'dilastyle', 'denssell',
  'morado', 'etere', 'rosifashion', 'addictboutique', 'rainy', 'zinc', 'norex',
  'comersebg', 'echo', 'ellis', 'duasol', 'lenafashion', 'vegeabg', 'danielfashion',
  'rollmann', 'madstitches', 'aure', 'colorycollection', 'mexess', 'granda',
  'fabnetstudiobg', 'indigostyle', 'danini', 'venix', 'mijelstore', 'marty',
  'tonikafashion', 'lizakain', 'adorafashionhous', 'maxistyle', 'montre',
  'maximarket', 'amiamoda', 'veneraplus', 'oblechise', 'soonmama', 'dawnm',
  'borianasport', 'freelinebg', 'klin', 'karmaoriginal', 'womenspower',
  'twiggyshop', 'popov', 'candybaby', 'ksport', 'monipetrov', 'meriboo',
  'maxiladystyle', 'imane', 'efrea', 'redics', 'bstyle'
];

const VALID_CODES_SET = new Set(VALID_INVITE_CODES.map((c) => c.toLowerCase().trim()));

export function isKnownInviteCode(code: string): boolean {
  if (!code) return false;
  return VALID_CODES_SET.has(code.toLowerCase().trim());
}
