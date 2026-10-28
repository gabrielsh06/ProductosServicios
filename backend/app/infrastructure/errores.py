"""Error de API con el formato del contrato: {"error": {"code", "message", "fields"?}}."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: dict = None):
        super().__init__(message)
        self.status, self.code, self.message, self.fields = status, code, message, fields

    def body(self) -> dict:
        err = {"code": self.code, "message": self.message}
        if self.fields:
            err["fields"] = self.fields
        return {"error": err}
