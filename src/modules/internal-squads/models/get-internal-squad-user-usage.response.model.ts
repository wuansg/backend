export class GetInternalSquadUserUsageResponseModel {
    public readonly days: {
        date: string;
        nodes: {
            uuid: string;
            uploadBytes: number;
            downloadBytes: number;
            totalBytes: number;
        }[];
    }[];

    constructor(data: GetInternalSquadUserUsageResponseModel) {
        this.days = data.days;
    }
}
