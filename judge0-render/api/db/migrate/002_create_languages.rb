class CreateLanguages < ActiveRecord::Migration[6.1]
  def change
    create_table :languages do |t|
      t.integer :id, null: false, primary_key: true
      t.string :name, null: false
      t.string :version, default: ''
      
      t.timestamps
    end
    
    # Insert supported languages
    reversible do |dir|
      dir.up do
        execute <<-SQL
          INSERT INTO languages (id, name, version) VALUES
          (50, 'C (GCC 9.2.0)', '9.2.0'),
          (54, 'C++ (GCC 9.2.0)', '9.2.0'),
          (51, 'C# (Mono 6.6.0.161)', '6.6.0.161'),
          (60, 'Go (1.13.5)', '1.13.5'),
          (62, 'Java (OpenJDK 13.0.1)', '13.0.1'),
          (63, 'JavaScript (Node.js 12.14.0)', '12.14.0'),
          (71, 'Python (3.8.1)', '3.8.1'),
          (74, 'TypeScript (3.7.4)', '3.7.4')
        SQL
      end
    end
  end
end
