/**
 * Lightweight heuristic protobuf decoder for extracting data from USS state keys.
 */

export interface IProtobufField {
    tag: number;
    wireType: number;
    value: any;
}

export class ProtobufDecoder {
    private _pos = 0;
    private _buffer: Buffer;

    constructor(data: Buffer | string) {
        this._buffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data;
    }

    public decode(): IProtobufField[] {
        const fields: IProtobufField[] = [];
        this._pos = 0;

        while (this._pos < this._buffer.length) {
            try {
                const header = this.readVarint();
                const wireType = header & 0x07;
                const tag = header >> 3;

                let value: any;
                switch (wireType) {
                    case 0: // Varint
                        value = this.readVarint();
                        break;
                    case 1: // 64-bit
                        value = this._buffer.readBigInt64LE(this._pos);
                        this._pos += 8;
                        break;
                    case 2: // Length-delimited
                        const len = this.readVarint();
                        value = this._buffer.subarray(this._pos, this._pos + len);
                        this._pos += len;
                        break;
                    case 5: // 32-bit
                        value = this._buffer.readInt32LE(this._pos);
                        this._pos += 4;
                        break;
                    default:
                        // Unknown wire type, abort
                        return fields;
                }

                fields.push({ tag, wireType, value });
            } catch {
                break;
            }
        }
        return fields;
    }

    private readVarint(): number {
        let val = 0;
        let shift = 0;
        while (true) {
            const byte = this._buffer[this._pos++];
            val += (byte & 0x7f) << shift;
            if (!(byte & 0x80)) break;
            shift += 7;
            if (shift > 31) break; // Keep it simple for now
        }
        return val;
    }

    /**
     * Extracts model info from the userStatus message.
     */
    public static extractModelQuotas(data: string): Array<{ name: string, refreshSeconds?: number }> {
        const decoder = new ProtobufDecoder(data);
        const fields = decoder.decode();
        const results: Array<{ name: string, refreshSeconds?: number }> = [];

        // In userStatus (tag 1), there's usually a repeated message for models
        const userStatusField = fields.find(f => f.tag === 1 && f.wireType === 2);
        if (userStatusField) {
            const nestedDecoder = new ProtobufDecoder(userStatusField.value);
            const nestedFields = nestedDecoder.decode();

            // Search for model quota sub-messages (this is heuristic based on the decoded strings I saw)
            // The model name is usually in a length-delimited string.
            for (const field of nestedFields) {
                if (field.wireType === 2) {
                    const subData = field.value.toString('utf8');
                    // Check if it looks like a model name (contains Gemini, Claude, GPT, etc.)
                    if (/Gemini|Claude|GPT|Llama/i.test(subData) && subData.length > 5 && subData.length < 50) {
                        // We found a model! Now look for timestamps in nearby fields.
                        
                        // We'll search the same sub-message for a varint field that looks like a relative time 
                        // or absolute timestamp (large value).
                        const modelContainerDecoder = new ProtobufDecoder(field.value); // Wait, field.value is just the name string
                        // Actually, name is likely a field within a repeated ModelQuota message.
                    }
                }
            }
            
            // Re-evaluating based on the strings I saw:
            // "Gemini 3.1 Pro (High)" is followed by numbers like 473711 (from my previous grep)
            
            // Let's try to find all strings and matching "time" varints in the same sequence.
            let lastModelName: string | undefined;
            for (const field of nestedFields) {
                if (field.wireType === 2) {
                    const str = field.value.toString('utf8');
                    if (/Gemini|Claude|GPT|Llama/i.test(str)) {
                        lastModelName = str;
                        results.push({ name: str });
                    }
                } else if (field.wireType === 0 && lastModelName) {
                    // Possible timestamp or seconds?
                    // "Refreshes in 5 days, 23 hours" is about 514,800 seconds.
                    const val = field.value;
                    if (val > 3600 && val < 2592000) { // 1h to 30d
                        const last = results[results.length - 1];
                        if (last && last.name === lastModelName) {
                            last.refreshSeconds = val;
                        }
                    }
                }
            }
        }

        return results;
    }
}
