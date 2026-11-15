import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { Public } from './auth.guard';
import { CurrentActor, Actor, ApiRequest } from '../../common/context';
import { parse, uuid } from '../../common/validation';
import { loginSchema, registerSchema, updateProfileSchema } from './auth.dto';
import { AvatarUpload, MAX_AVATAR_BYTES } from './auth.service';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Public()
  @Post('auth/register')
  register(@Body() body: unknown, @Req() req: ApiRequest) {
    return this.auth.register(parse(registerSchema, body), req.ip ?? 'unknown', req.requestId);
  }
  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: ApiRequest) {
    const input = parse(loginSchema, body);
    return this.auth.passwordLogin(input.identifier, input.password, req.ip ?? 'unknown');
  }
  @Public()
  @Post('auth/otp/request')
  @HttpCode(202)
  request(@Body() body: unknown, @Req() req: ApiRequest) {
    const input = parse(z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).strict(), body);
    return this.auth.requestOtp(input.phone, req.ip ?? 'unknown');
  }
  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  verify(@Body() body: unknown, @Req() req: ApiRequest) {
    const input = parse(
      z.object({ challengeId: uuid, code: z.string().regex(/^\d{6}$/) }).strict(),
      body,
    );
    return this.auth.verify(input.challengeId, input.code, req.ip ?? 'unknown');
  }
  @Get('me') me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor);
  }
  @Patch('me')
  updateProfile(@CurrentActor() actor: Actor, @Body() body: unknown, @Req() request: ApiRequest) {
    return this.auth.updateProfile(actor, parse(updateProfileSchema, body), request.requestId);
  }
  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
    }),
  )
  uploadAvatar(
    @CurrentActor() actor: Actor,
    @UploadedFile() avatar: AvatarUpload | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.auth.uploadAvatar(actor, avatar, request.requestId);
  }
  @Delete('me/avatar')
  removeAvatar(@CurrentActor() actor: Actor, @Req() request: ApiRequest) {
    return this.auth.removeAvatar(actor, request.requestId);
  }
  @Post('auth/refresh') @HttpCode(200) refresh(@CurrentActor() actor: Actor) {
    return this.auth.refresh(actor);
  }
  @Post('auth/logout') @HttpCode(200) logout(@CurrentActor() actor: Actor, @Req() req: ApiRequest) {
    return this.auth.logout(actor, req.requestId);
  }
}
