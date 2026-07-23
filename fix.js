const fs = require('fs');
let content = fs.readFileSync('frontend/src/app/curation/page.tsx', 'utf8');

// Find the misplaced }{activeStatus === 'ai_rules'
const marker = '}{activeStatus === \\'ai_rules\\' ? (';
let markerIndex = content.indexOf('}\\n{activeStatus === \\'ai_rules\\' ? (');
if (markerIndex === -1) markerIndex = content.indexOf('}{activeStatus === \\'ai_rules\\' ? (');

if (markerIndex > -1) {
    // We need to move the activeStatus block to before the end of the return statement.
    // The problem is that the original file was broken apart.
    // Actually, it's easier to just strip the extra 
    //       </div>
    //     </div>
    //   )
    // }
    // and place it at the very end.
    
    // Wait, let's just do it manually in JS.
    let before = content.substring(0, markerIndex);
    let after = content.substring(markerIndex + 1); // remove the extra '}'
    
    // In 'before', remove the trailing </div></div>)
    before = before.replace(/\\s*<\\/div>\\s*<\\/div>\\s*\\)\\s*$/g, '');
    
    content = before + '\\n' + after;
    fs.writeFileSync('frontend/src/app/curation/page.tsx', content);
    console.log('Fixed syntax by moving closing tags');
} else {
    console.log('Could not find marker');
}
