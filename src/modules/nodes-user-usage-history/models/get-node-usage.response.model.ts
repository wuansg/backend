export class GetNodeUsageResponseModel {
    public readonly nodes: {
        uuid: string;
        users: { id: number; uploadBytes: number; downloadBytes: number; totalBytes: number }[];
    }[];

    constructor(data: GetNodeUsageResponseModel) {
        this.nodes = data.nodes;
    }
}
