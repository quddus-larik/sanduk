import { Module } from "@nestjs/common";
import { VideoGateway } from "./video.gateway.js";

@Module({
    providers: [VideoGateway],
})
export class VideoModule {}
