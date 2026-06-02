import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/**
 * Global CryptoModule — provides CryptoService to every module in the app
 * without requiring explicit imports.
 *
 * Import this module once in AppModule. All feature modules (patients,
 * consultations, ehr, prescriptions, …) can inject CryptoService directly
 * without adding CryptoModule to their own imports array.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
