import { Base64GeneratorService } from './base64.generator.service';
import { ClashGeneratorService } from './clash.generator.service';
import { MihomoGeneratorService } from './mihomo.generator.service';
import { SingBoxGeneratorService } from './singbox.generator.service';
import { SurgeGeneratorService } from './surge.generator.service';

export const TEMPLATE_RENDERERS = [
    MihomoGeneratorService,
    ClashGeneratorService,
    SurgeGeneratorService,
    Base64GeneratorService,
    SingBoxGeneratorService,
];
