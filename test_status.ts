
import * as vscode from 'vscode';
import { AntigravitySDK } from './src/index';

export async function testStatus(context: vscode.ExtensionContext) {
    const sdk = new AntigravitySDK(context);
    try {
        await sdk.initialize();
        console.log('--- USER STATUS ---');
        const status = await sdk.ls.getUserStatus();
        console.log(JSON.stringify(status, null, 2));

        console.log('--- ALL KEYS ---');
        const keys = await sdk.state.getAntigravityKeys();
        for (const key of keys) {
            if (key.includes('Status') || key.includes('Model') || key.includes('Credit')) {
                const val = await sdk.state.getRawValue(key);
                console.log(`Key: ${key}`);
                if (val) {
                    try {
                        const decoded = Buffer.from(val, 'base64').toString('utf8');
                        console.log(`Decoded (UTF8): ${decoded.substring(0, 200)}...`);
                    } catch {
                        console.log(`Base64: ${val.substring(0, 100)}...`);
                    }
                }
                console.log('---');
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}
