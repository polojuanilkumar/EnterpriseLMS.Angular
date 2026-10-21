import { Component } from '@angular/core';

@Component({
  selector: 'app-brand',
  template: `
    <div class="flex items-center gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-lg font-bold text-white" aria-hidden="true">E</span>
      <span class="text-xl font-bold tracking-tight text-slate-900">Enterprise LMS</span>
    </div>
  `,
})
export class BrandComponent {}
