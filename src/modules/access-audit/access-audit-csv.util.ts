// Protect spreadsheet consumers, including strings prefixed by spaces/control characters.
export function auditCsvCell(value: unknown): string {
    let text = String(value ?? '');
    if (/^[\s\p{Cc}]*[=+@-]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
}
export function auditCsv(rows: Array<Record<string, unknown>>): string {
    const fields = [
        'id',
        'userId',
        'username',
        'nodeUuid',
        'nodeName',
        'domain',
        'destinationIp',
        'destinationPort',
        'inbound',
        'network',
        'protocol',
        'startedAt',
        'observedAt',
        'closedAt',
        'upload',
        'download',
        'partial',
    ];
    return (
        '\uFEFF' +
        [fields, ...rows.map((row) => fields.map((field) => row[field]))]
            .map((row) => row.map(auditCsvCell).join(','))
            .join('\r\n') +
        '\r\n'
    );
}
