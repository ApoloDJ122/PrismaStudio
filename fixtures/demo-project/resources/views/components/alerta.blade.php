@props(['tipo' => 'aviso'])

<div class="alerta alerta--{{ $tipo }}" role="status">
  {{ $slot }}
</div>
