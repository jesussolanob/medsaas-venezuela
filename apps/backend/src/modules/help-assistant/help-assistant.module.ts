import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Port symbol — imported from ai-transcription; we do NOT redefine it.
import { AI_TEXT_GENERATOR_PORT } from '../ai-transcription/application/ports/ai-text-generator.port';

// Concrete adapter — reused from ai-transcription's infrastructure layer.
// We instantiate it here via useFactory so this module is self-contained and
// does NOT import AiTranscriptionModule (avoiding unintended coupling with its
// Sequelize models, repositories, and plan-gating logic).
import { GeminiTextAdapter } from '../ai-transcription/infrastructure/adapters/gemini-text.adapter';

// Application layer
import { HelpChatUseCase } from './application/use-cases/help-chat.use-case';

// Presentation layer
import { HelpChatController } from './presentation/controllers/help-chat.controller';

/**
 * HelpAssistantModule
 *
 * Owns:
 *   POST /api/help/chat
 *
 * No database tables, no Sequelize models, no migrations.
 * History is stateless — the caller sends the full conversation each request.
 *
 * The AI provider (GeminiTextAdapter) is bound locally to AI_TEXT_GENERATOR_PORT
 * using the same factory pattern as AiTranscriptionModule, keeping the two modules
 * independently deployable and testable.
 */
@Module({
  imports: [
    // ConfigModule is global, but explicit import makes the dependency clear.
    ConfigModule,
  ],
  controllers: [HelpChatController],
  providers: [
    // Gemini text adapter — bound to the shared port symbol.
    // useFactory allows constructor injection of ConfigService without needing
    // to import the entire AiTranscriptionModule.
    {
      provide: AI_TEXT_GENERATOR_PORT,
      useFactory: (config: ConfigService) => new GeminiTextAdapter(config),
      inject: [ConfigService],
    },

    HelpChatUseCase,
  ],
})
export class HelpAssistantModule {}
