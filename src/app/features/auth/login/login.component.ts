import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, authErrorMessage } from '../../../core/auth/auth.service';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrandComponent } from '../../../shared/ui/brand/brand.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, BrandComponent, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly pending = signal(false);
  readonly connectionMessage = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(254)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(1024)] }),
  });
  passwordVisible = false;

  showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  async submit(): Promise<void> {
    if (this.pending()) return;
    this.connectionMessage.set('');
    this.auth.state.notice.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.pending.set(true);
    const credentials = this.form.getRawValue();
    this.form.controls.password.reset();
    this.passwordVisible = false;
    try {
      await this.auth.login(credentials);
      if (this.auth.state.session()) await this.router.navigateByUrl('/session');
    } catch (error) {
      this.connectionMessage.set(authErrorMessage(error));
    } finally {
      credentials.password = '';
      this.form.controls.password.reset();
      this.pending.set(false);
    }
  }
}
