import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  const ingresar = () => navigate("/menu");

  return {
    /* Hero centrado, moderno */
  } && (
    <div className="hero">
      <div className="card card-sm" style={{ textAlign: "center" }}>
        <div className="brand" style={{ justifyContent: "center" }}>
          <div className="logo">CB</div>
          <div>
            <h1 className="title" style={{ marginBottom: 2 }}>
              Sistema de Liquidación para Facturación
            </h1>
            <div className="subtitle">CBMEDIC · Control y gestión</div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <label>Usuario</label>
          <input type="text" placeholder="usuario" />
          <label>Contraseña</label>
          <input type="password" placeholder="********" />
        </div>

        <button className="btn btn-primary" onClick={ingresar} style={{ width: "100%", marginTop: 10 }}>
          Ingresar
        </button>
      </div>
    </div>
  );
}
