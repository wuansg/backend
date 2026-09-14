export interface INodeUsage {
    uuid: string;
    users: {
        id: number;
        uploadBytes: number;
        downloadBytes: number;
        totalBytes: number;
    }[];
}
