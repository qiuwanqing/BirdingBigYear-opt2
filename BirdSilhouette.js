// Authored silhouettes for the one known bottle bird, not a classifier.
// Each pose is a fixed drawing: no mesh, vertex warping or independent X/Y scale.
const black='#10110f';
// Smooth, slender contours; feet and wing tips stay understated at small sizes.
const standing=`<path d="M22 83L78 62C86 55 96 59 97 68C99 79 85 97 79 115C73 131 76 145 84 152C105 136 146 146 170 167C155 181 132 183 112 176L103 225L105 278Q110 282 125 284Q128 287 118 287L96 287L93 226L95 178L85 176L79 225L79 278L93 282Q98 286 87 286L66 286Q62 284 71 278L72 225L77 173C61 161 59 147 63 132C66 117 76 98 82 84C87 73 85 69 78 72Z"/><path d="M84 63C87 49 83 30 91 22Q97 18 101 21C94 33 99 53 92 66Z"/>`;
const body=`<path d="M12 65L54 51C60 46 69 47 70 54C71 61 62 66 64 73C73 86 83 90 94 88C112 80 136 87 147 98L158 104Q149 109 141 110C120 115 103 105 94 103C76 102 64 91 57 76Q53 68 56 61Z"/><path d="M60 52C57 40 57 27 67 22Q63 40 68 49Z"/><path d="M139 104Q173 112 207 123L215 125Q217 128 210 128L202 126L135 110ZM128 108Q160 123 192 135L202 138Q205 141 198 141L187 137L123 112Z"/>`;
const wings=[
 `<path d="M94 95C80 78 78 51 83 24Q85 15 89 13Q91 30 98 42C97 22 102 12 106 11Q115 36 113 53Q125 34 134 32C139 51 128 79 111 98Z"/><path d="M106 96C122 74 147 48 174 34Q183 31 184 35C172 63 152 88 130 101Z"/>`,
 `<path d="M94 95C75 88 58 74 48 59Q45 53 49 53C72 58 94 69 111 88Z"/><path d="M105 94C133 76 168 70 195 74Q205 76 205 79C182 92 153 102 123 104Z"/>`,
 `<path d="M95 93C79 104 69 125 68 143Q68 151 72 150C85 140 95 126 101 113Q100 134 104 141C118 130 122 112 113 99Z"/><path d="M110 96C136 102 157 124 165 143Q169 152 164 152C142 145 121 125 107 107Z"/>`,
 `<path d="M97 95C74 93 50 81 36 69Q32 64 38 63C66 66 92 76 113 89Z"/><path d="M107 96C140 89 178 94 203 104Q209 108 203 110C171 117 142 111 119 106Z"/>`
];
const svg=(width,height,paths)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="${black}">${paths}</g></svg>`;
let ready;
function imageFromSVG(markup){return new Promise((resolve,reject)=>{
 const image=new Image(),url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));
 image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
 image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('鸟剪影加载失败，请重试。'));};image.src=url;
});}
export function loadBirdSilhouettes(){
 if(!ready)ready=Promise.all([imageFromSVG(svg(192,310,standing)),...wings.map(wing=>imageFromSVG(svg(240,160,body+wing))),...wings.map(wing=>imageFromSVG(svg(240,160,`<g transform="translate(240 0) scale(-1 1)">${body+wing}</g>`)))]).then(([standing,...poses])=>({standing,frames:poses.slice(0,4),rightFrames:poses.slice(4)})).catch(error=>{ready=null;throw error;});
 return ready;
}
