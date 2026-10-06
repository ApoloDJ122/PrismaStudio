@extends('layouts.app')

@section('content')
  <link rel="stylesheet" href="../../resources/css/app.css" />

  <h1 class="titulo">{{ $titulo }}</h1>

  <x-alerta tipo="info">
    Todo listo para trabajar con plantillas de Laravel.
  </x-alerta>

  @if ($usuario !== null)
    <p class="saludo">Bienvenido, {{ $usuario->nombre }}.</p>
  @else
    <p class="saludo">Hola, invitado.</p>
  @endif

  <ul>
    @foreach ($tareas as $tarea)
      <li class="tarea">{{ $tarea }}</li>
    @endforeach
  </ul>
@endsection
