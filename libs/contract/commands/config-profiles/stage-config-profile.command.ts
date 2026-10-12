import { getEndpointDetails } from '../../constants';
import { UpdateConfigProfileCommand } from './update-config-profile.command';
export namespace StageConfigProfileCommand {
    export const url = '/api/config-profiles/stage';
    export const TSQ_url = url;
    export const endpointDetails = getEndpointDetails(
        'stage',
        'post',
        'Save a profile without publishing it; pin acknowledged node templates',
        { scope: 'stage', kind: 'write' },
    );
    export const RequestBodySchema = UpdateConfigProfileCommand.RequestBodySchema.omit({
        deployStrategy: true,
    });
    export const ResponseSchema = UpdateConfigProfileCommand.ResponseSchema;
}
