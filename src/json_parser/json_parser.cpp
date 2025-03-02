class JsonParser {
public:
    JsonParser();
    JsonParser( JsonParser&& )                 = default;
    JsonParser( const JsonParser& )            = default;
    JsonParser& operator=( JsonParser&& )      = default;
    JsonParser& operator=( const JsonParser& ) = default;
    ~JsonParser();

private:
};
