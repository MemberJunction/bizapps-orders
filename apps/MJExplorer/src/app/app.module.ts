//***********************************************************
// Angular
//***********************************************************
import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

//***********************************************************
// MJ - Consolidated Module Bundles
//***********************************************************
import {
  MJExplorerModulesBundle,
  SharedService
} from '@memberjunction/ng-explorer-modules';
import { AuthServicesModule, RedirectComponent, MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJExplorerAppModule } from '@memberjunction/ng-explorer-app';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import {CLASS_REGISTRATIONS} from '@memberjunction/ng-bootstrap';

// Import supplemental manifests — common first so Organization / Person
// classes register before any Orders class references them.
import {CLASS_REGISTRATIONS as COMMON_CLASSES} from '@mj-biz-apps/common-ng';
import {CLASS_REGISTRATIONS as LOCAL_CLASSES} from '@mj-biz-apps/orders-ng';

// static code path builder
const combinedClasses = [...CLASS_REGISTRATIONS, ...COMMON_CLASSES, ...LOCAL_CLASSES];

//***********************************************************
//MSAL
//***********************************************************
import { MsalGuardConfiguration } from '@azure/msal-angular';
import { InteractionType } from '@azure/msal-browser';

//***********************************************************
// Project stuff
//***********************************************************
import { AppComponent } from './app.component';
import { environment } from '../environments/environment';
import { NavigationItemDemoComponent } from './demo/navigation-item.component';


/**
 * Set your default interaction type for MSALGuard here. If you have any
 * additional scopes you want the user to consent upon login, add them here as well.
 */
export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
  };
}

/**
 * Initialize auth provider before Angular routing starts
 * This ensures MSAL can process OAuth redirect responses before Angular's router
 * consumes the URL hash
 */
export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

@NgModule({
  declarations: [
    AppComponent, 
    NavigationItemDemoComponent
  ],
  imports: [
    // Angular Core Modules
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,

    // MJ Consolidated Bundle (includes all MJ + Kendo modules)
    MJExplorerModulesBundle,

    // Auth (needs forRoot configuration)
    AuthServicesModule.forRoot(environment),

    // Explorer App Shell (includes login UI, validation, and mj-shell wrapper)
    MJExplorerAppModule.forRoot(environment),

  ],
  providers: [
    SharedService,
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [MJAuthBase],
      multi: true
    }
  ],
  bootstrap: [AppComponent, RedirectComponent],
})
export class AppModule {}
