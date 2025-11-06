#!/usr/bin/env node

/**
 * Portal Script Error Checker
 * Checks all portal HTML files for JavaScript errors, missing functions, and button issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTAL_FILES = [
    'index.html',
    'director-portal.html',
    'distributor-portal.html',
    'gm-portal.html',
    'hr-portal.html',
    'mis-portal.html',
    'stock-management-portal.html',
    'appointments-admin.html',
    'finance-bonus-upload.html',
    'distributor-guest.html',
    'dynapharm-complete-system.html'
];

const errors = [];
const warnings = [];

function extractOnClickHandlers(content) {
    const onclickRegex = /onclick=["']([^"']+)["']/gi;
    const handlers = [];
    let match;
    
    while ((match = onclickRegex.exec(content)) !== null) {
        handlers.push({
            handler: match[1],
            context: getContext(content, match.index, 100)
        });
    }
    
    return handlers;
}

function extractFunctionDefinitions(content) {
    const functions = new Set();
    
    // Match function declarations: function name() or function name() {
    const funcRegex = /function\s+(\w+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
        functions.add(match[1]);
    }
    
    // Match arrow functions assigned to variables: const name = () => or const name = async () =>
    const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
    while ((match = arrowRegex.exec(content)) !== null) {
        functions.add(match[1]);
    }
    
    // Match window.name = function() or window.name = async function()
    const windowFuncRegex = /window\.(\w+)\s*=\s*(?:async\s+)?function/g;
    while ((match = windowFuncRegex.exec(content)) !== null) {
        functions.add(match[1]);
    }
    
    return functions;
}

function getContext(content, index, length) {
    const start = Math.max(0, index - length);
    const end = Math.min(content.length, index + length);
    return content.substring(start, end).replace(/\n/g, ' ').trim();
}

function checkHandler(handler, definedFunctions, file) {
    const handlerCode = handler.handler.trim();
    
    // Skip empty handlers
    if (!handlerCode) return;
    
    // Extract function calls from handler
    // Match patterns like: functionName(), functionName('arg'), functionName("arg")
    const funcCallRegex = /(\w+)\s*\(/g;
    const calls = [];
    let match;
    
    while ((match = funcCallRegex.exec(handlerCode)) !== null) {
        const funcName = match[1];
        // Skip common built-ins and DOM methods
        if (!['alert', 'confirm', 'console', 'document', 'window', 'event', 'this', 'return', 'if', 'else'].includes(funcName)) {
            calls.push(funcName);
        }
    }
    
    // Check each function call
    for (const funcName of calls) {
        if (!definedFunctions.has(funcName)) {
            errors.push({
                file,
                type: 'missing_function',
                message: `Function "${funcName}" is called in onclick handler but not defined`,
                handler: handlerCode,
                context: handler.context
            });
        }
    }
    
    // Check for syntax errors in handler
    try {
        // Try to parse as a simple expression
        new Function(handlerCode);
    } catch (e) {
        // Some handlers might be valid but not parseable as standalone functions
        // Only report if it looks like a real syntax error
        if (e.message.includes('Unexpected') || e.message.includes('SyntaxError')) {
            warnings.push({
                file,
                type: 'syntax_warning',
                message: `Potential syntax issue in onclick handler: ${e.message}`,
                handler: handlerCode
            });
        }
    }
}

function checkJavaScriptSyntax(content, file) {
    // Extract all <script> blocks
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptIndex = 0;
    
    while ((match = scriptRegex.exec(content)) !== null) {
        scriptIndex++;
        const scriptContent = match[1];
        
        // Skip if it's an external script src
        if (match[0].includes('src=')) continue;
        
        // Try to parse the JavaScript
        try {
            // Use a simple check - try to create a function from it
            // This won't catch all errors but will catch many
            new Function(scriptContent);
        } catch (e) {
            // Some errors are expected (like references to DOM elements)
            // Only report clear syntax errors
            if (e.message.includes('Unexpected token') || 
                e.message.includes('Missing') ||
                e.message.includes('SyntaxError')) {
                errors.push({
                    file,
                    type: 'javascript_syntax',
                    message: `JavaScript syntax error in script block #${scriptIndex}: ${e.message}`,
                    error: e.message
                });
            }
        }
    }
}

function checkFile(filePath) {
    const fileName = path.basename(filePath);
    console.log(`\nChecking ${fileName}...`);
    
    if (!fs.existsSync(filePath)) {
        errors.push({
            file: fileName,
            type: 'file_not_found',
            message: `File not found: ${filePath}`
        });
        return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract onclick handlers
    const handlers = extractOnClickHandlers(content);
    console.log(`  Found ${handlers.length} onclick handlers`);
    
    // Extract function definitions
    const functions = extractFunctionDefinitions(content);
    console.log(`  Found ${functions.size} function definitions`);
    
    // Check each handler
    for (const handler of handlers) {
        checkHandler(handler, functions, fileName);
    }
    
    // Check JavaScript syntax
    checkJavaScriptSyntax(content, fileName);
    
    // Check for common issues
    // 1. Missing event.preventDefault() in form handlers
    if (content.includes('addEventListener') && content.includes('submit') && 
        !content.includes('preventDefault') && content.includes('form')) {
        warnings.push({
            file: fileName,
            type: 'missing_preventDefault',
            message: 'Form submit handler may be missing preventDefault()'
        });
    }
    
    // 2. Check for undefined variables in common patterns
    if (content.includes('window.currentUser') && !content.includes('currentUser') && 
        !content.includes('getCurrentUser') && !content.includes('localStorage.getItem(\'currentUser\')')) {
        warnings.push({
            file: fileName,
            type: 'potential_undefined',
            message: 'window.currentUser is used but may not be initialized'
        });
    }
    
    return { handlers: handlers.length, functions: functions.size };
}

// Main execution
console.log('='.repeat(60));
console.log('Portal Script Error Checker');
console.log('='.repeat(60));

const stats = {};

for (const portalFile of PORTAL_FILES) {
    const filePath = path.join(__dirname, portalFile);
    const result = checkFile(filePath);
    if (result) {
        stats[portalFile] = result;
    }
}

// Print results
console.log('\n' + '='.repeat(60));
console.log('RESULTS');
console.log('='.repeat(60));

if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ No errors or warnings found!');
} else {
    if (errors.length > 0) {
        console.log(`\n❌ ERRORS (${errors.length}):`);
        console.log('-'.repeat(60));
        errors.forEach((error, index) => {
            console.log(`\n${index + 1}. ${error.file}`);
            console.log(`   Type: ${error.type}`);
            console.log(`   Message: ${error.message}`);
            if (error.handler) {
                console.log(`   Handler: ${error.handler.substring(0, 100)}`);
            }
        });
    }
    
    if (warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
        console.log('-'.repeat(60));
        warnings.forEach((warning, index) => {
            console.log(`\n${index + 1}. ${warning.file}`);
            console.log(`   Type: ${warning.type}`);
            console.log(`   Message: ${warning.message}`);
        });
    }
}

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`Files checked: ${PORTAL_FILES.length}`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);

// Write detailed report to file
const report = {
    timestamp: new Date().toISOString(),
    summary: {
        filesChecked: PORTAL_FILES.length,
        errors: errors.length,
        warnings: warnings.length
    },
    errors,
    warnings,
    stats
};

fs.writeFileSync(
    path.join(__dirname, 'portal-errors-report.json'),
    JSON.stringify(report, null, 2)
);

console.log('\n📄 Detailed report saved to: portal-errors-report.json');

// Exit with error code if errors found
process.exit(errors.length > 0 ? 1 : 0);

